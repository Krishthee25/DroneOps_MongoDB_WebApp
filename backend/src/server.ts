import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { MongoClient, ObjectId, Db } from "mongodb";
import Redis from "ioredis";

dotenv.config();
const app = express();
app.use(cors());
app.use(express.json());

const PORT = Number(process.env.PORT || 4000);
const MONGO_URI = process.env.MONGO_URI || "mongodb://localhost:27017/droneops";
const redis = new Redis(process.env.REDIS_URL || "redis://localhost:6379");
let db: Db;

const drones = () => db.collection("drones");
const operators = () => db.collection("operators");
const missions = () => db.collection("missions");
const alerts = () => db.collection("alerts");
const maintenance = () => db.collection("maintenance");

async function seed() {
  if (await drones().countDocuments() === 0) await drones().insertMany([
    {id:"DR-001",name:"Falcon Survey",type:"Inspection",status:"Available",battery:92,flightHours:124,maintenance:"Healthy",charging:false,health:94},
    {id:"DR-002",name:"Agri Hawk",type:"Agriculture",status:"In Mission",battery:67,flightHours:88,maintenance:"Healthy",charging:false,health:91},
    {id:"DR-003",name:"Sentinel X",type:"Surveillance",status:"Maintenance",battery:18,flightHours:210,maintenance:"Due",charging:false,health:72},
    {id:"DR-004",name:"Cargo Lift",type:"Logistics",status:"Available",battery:84,flightHours:61,maintenance:"Healthy",charging:false,health:96},
    {id:"DR-005",name:"Mapper Pro",type:"Mapping",status:"Offline",battery:8,flightHours:175,maintenance:"Healthy",charging:false,health:68},
    {id:"DR-006",name:"Inspectra",type:"Inspection",status:"Available",battery:78,flightHours:96,maintenance:"Healthy",charging:false,health:93}
  ]);
  if (await operators().countDocuments() === 0) await operators().insertMany([
    {id:"OP-001",name:"Priya Nair",status:"Available",missions:18,flightHours:142},
    {id:"OP-002",name:"Rahul Kumar",status:"On Mission",missions:25,flightHours:211},
    {id:"OP-003",name:"Arun Das",status:"Available",missions:12,flightHours:104},
    {id:"OP-004",name:"Meera Shah",status:"Unavailable",missions:21,flightHours:188}
  ]);
  if (await missions().countDocuments() === 0) await missions().insertMany([
    {id:"M-1001",name:"Farm Field Inspection",type:"Agriculture",drone:"DR-002",operator:"OP-002",status:"In Progress",progress:64,battery:67,location:"Coimbatore, Tamil Nadu",startedAt:new Date().toISOString()},
    {id:"M-1002",name:"Bridge Structural Survey",type:"Inspection",drone:"DR-001",operator:"OP-001",status:"Scheduled",progress:0,battery:92,location:"Chennai, Tamil Nadu"},
    {id:"M-1003",name:"Perimeter Surveillance",type:"Surveillance",drone:"DR-006",operator:"OP-003",status:"Scheduled",progress:0,battery:78,location:"Bengaluru, Karnataka"}
  ]);
  if (await alerts().countDocuments() === 0) await alerts().insertMany([
    {id:1,severity:"CRITICAL",message:"DR-005 battery critically low — 8%",time:"2 min ago",resolved:false},
    {id:2,severity:"WARNING",message:"DR-003 maintenance is due",time:"18 min ago",resolved:false},
    {id:3,severity:"WARNING",message:"Scheduling conflict detected",time:"32 min ago",resolved:false}
  ]);
  if (await maintenance().countDocuments() === 0) await maintenance().insertMany([
    {id:1,drone:"DR-001",lastService:"20 Aug 2026",nextService:"20 Sep 2026",type:"Routine Inspection",status:"Healthy"},
    {id:2,drone:"DR-003",lastService:"06 Aug 2026",nextService:"06 Sep 2026",type:"Routine Inspection",status:"Due"},
    {id:3,drone:"DR-004",lastService:"15 Aug 2026",nextService:"15 Sep 2026",type:"Battery Check",status:"Healthy"},
    {id:4,drone:"DR-006",lastService:"18 Aug 2026",nextService:"18 Sep 2026",type:"Routine Inspection",status:"Healthy"}
  ]);
}

async function dashboardData() {
  const ds = await drones().find().toArray();
  const ms = await missions().find().toArray();
  const as = await alerts().find({resolved:false}).toArray();
  return {totalDrones:ds.length,available:ds.filter(d=>d.status==="Available").length,inMission:ds.filter(d=>d.status==="In Mission").length,maintenance:ds.filter(d=>d.status==="Maintenance").length,offline:ds.filter(d=>d.status==="Offline").length,activeMissions:ms.filter(m=>m.status==="In Progress").length,alerts:as.length,fleet:["Available","In Mission","Maintenance","Offline"].map(name=>({name,value:ds.filter(d=>d.status===name).length}))};
}

app.get("/health", async (_req,res)=>{try{await db.command({ping:1});await redis.ping();res.json({success:true,service:"DroneOps API",database:"MongoDB connected",redis:"connected"})}catch{res.status(503).json({success:false,message:"Dependencies unavailable"})}});
app.get("/api/dashboard",async(_req,res)=>{const data=await dashboardData();await redis.set("dashboard",JSON.stringify(data),"EX",30);res.json({success:true,data})});

app.get("/api/drones",async(_req,res)=>res.json({success:true,data:await drones().find().sort({id:1}).toArray()}));
app.post("/api/drones",async(req,res)=>{const {id,name,type,battery=100,flightHours=0}=req.body;if(!id||!name||!type)return res.status(400).json({success:false,message:"Drone ID, name and type are required"});const b=Number(battery),h=Number(flightHours);if(!Number.isFinite(b)||b<0||b>100)return res.status(400).json({success:false,message:"Battery must be between 0 and 100"});if(await drones().findOne({id:String(id).toUpperCase()}))return res.status(409).json({success:false,message:"Drone ID already exists"});const d={id:String(id).toUpperCase(),name:String(name),type:String(type),status:b<20?"Offline":"Available",battery:b,flightHours:h,maintenance:"Healthy",charging:false,health:100};await drones().insertOne(d);res.status(201).json({success:true,data:d})});
app.post("/api/drones/:id/charge",async(req,res)=>{const d=await drones().findOne({id:req.params.id});if(!d)return res.status(404).json({success:false,message:"Drone not found"});const action=req.body.action||"start";if(action==="start"){if(d.status==="In Mission")return res.status(409).json({success:false,message:"Cannot charge a drone while it is in mission"});await drones().updateOne({id:d.id},{$set:{charging:true,status:"Charging"}})}else if(action==="stop"){await drones().updateOne({id:d.id},{$set:{charging:false,status:d.battery<20?"Offline":"Available"}})}else if(action==="full"){await drones().updateOne({id:d.id},{$set:{battery:100,charging:false,status:"Available"}})}res.json({success:true,data:await drones().findOne({id:d.id})})});
app.post("/api/drones/:id/service",async(req,res)=>{const d=await drones().findOne({id:req.params.id});if(!d)return res.status(404).json({success:false,message:"Drone not found"});await drones().updateOne({id:d.id},{$set:{status:"Available",maintenance:"Healthy",health:Math.min(100,d.health+10)}});await maintenance().updateMany({drone:d.id},{$set:{status:"Healthy"}});res.json({success:true,data:await drones().findOne({id:d.id})})});

app.get("/api/operators",async(_req,res)=>res.json({success:true,data:await operators().find().sort({id:1}).toArray()}));
app.post("/api/operators",async(req,res)=>{const {name}=req.body;if(!name)return res.status(400).json({success:false,message:"Operator name is required"});const count=await operators().countDocuments();const op={id:`OP-${String(count+1).padStart(3,"0")}`,name,status:"Available",missions:0,flightHours:0};await operators().insertOne(op);res.status(201).json({success:true,data:op})});

app.get("/api/missions",async(_req,res)=>res.json({success:true,data:await missions().find().sort({id:1}).toArray()}));
app.post("/api/missions",async(req,res)=>{const {name,type,drone,operator,location}=req.body;if(!name||!type||!drone||!operator)return res.status(400).json({success:false,message:"All mission fields are required"});const d=await drones().findOne({id:drone}),o=await operators().findOne({id:operator});if(!d||d.status!=="Available")return res.status(409).json({success:false,message:"Selected drone is not available"});if(d.battery<35)return res.status(409).json({success:false,message:"Insufficient battery for mission"});if(!o||o.status!=="Available")return res.status(409).json({success:false,message:"Selected operator is not available"});const count=await missions().countDocuments();const m={id:`M-${1001+count}`,name,type,drone,operator,status:"Scheduled",progress:0,battery:d.battery,location};await missions().insertOne(m);res.status(201).json({success:true,data:m})});
app.post("/api/missions/:id/start",async(req,res)=>{const m=await missions().findOne({id:req.params.id});if(!m)return res.status(404).json({success:false,message:"Mission not found"});const d=await drones().findOne({id:m.drone}),o=await operators().findOne({id:m.operator});if(!d||!o)return res.status(404).json({success:false,message:"Drone or operator not found"});if(d.battery<20)return res.status(409).json({success:false,message:"Battery too low to start"});if(d.status!=="Available")return res.status(409).json({success:false,message:"Drone is not available"});await missions().updateOne({id:m.id},{$set:{status:"In Progress",startedAt:new Date().toISOString()}});await drones().updateOne({id:d.id},{$set:{status:"In Mission"}});await operators().updateOne({id:o.id},{$set:{status:"On Mission"}});res.json({success:true,data:await missions().findOne({id:m.id})})});
app.post("/api/missions/:id/cancel",async(req,res)=>{const m=await missions().findOne({id:req.params.id});if(!m)return res.status(404).json({success:false,message:"Mission not found"});await missions().updateOne({id:m.id},{$set:{status:"Cancelled"}});await drones().updateOne({id:m.drone,status:"In Mission"},{$set:{status:"Available"}});await operators().updateOne({id:m.operator,status:"On Mission"},{$set:{status:"Available"}});res.json({success:true,data:await missions().findOne({id:m.id})})});

app.get("/api/alerts",async(_req,res)=>res.json({success:true,data:await alerts().find().sort({id:1}).toArray()}));
app.patch("/api/alerts/:id/resolve",async(req,res)=>{const result=await alerts().findOneAndUpdate({id:Number(req.params.id)},{$set:{resolved:true}},{returnDocument:"after"});if(!result)return res.status(404).json({success:false,message:"Alert not found"});res.json({success:true,data:result})});

app.get("/api/maintenance",async(_req,res)=>res.json({success:true,data:await maintenance().find().sort({id:1}).toArray()}));
app.post("/api/maintenance",async(req,res)=>{const {drone,type="Routine Inspection",nextService="20 Sep 2026"}=req.body;if(!drone)return res.status(400).json({success:false,message:"Drone is required"});const count=await maintenance().countDocuments();const row={id:count+1,drone,lastService:"29 Sep 2026",nextService,type,status:"Scheduled"};await maintenance().insertOne(row);await drones().updateOne({id:drone},{$set:{status:"Maintenance",maintenance:"Scheduled"}});res.status(201).json({success:true,data:row})});
app.post("/api/maintenance/:id/complete",async(req,res)=>{const row=await maintenance().findOne({id:Number(req.params.id)});if(!row)return res.status(404).json({success:false,message:"Maintenance record not found"});await maintenance().updateOne({id:row.id},{$set:{status:"Healthy",lastService:"29 Sep 2026"}});const d=await drones().findOne({id:row.drone});if(d)await drones().updateOne({id:d.id},{$set:{status:d.battery<20?"Offline":"Available",maintenance:"Healthy",health:Math.min(100,d.health+8)}});res.json({success:true,data:await maintenance().findOne({id:row.id})})});

app.get("/api/analytics",async(_req,res)=>res.json({success:true,data:{missions:[{month:"Jan",completed:31,failed:2},{month:"Feb",completed:42,failed:3},{month:"Mar",completed:48,failed:1},{month:"Apr",completed:56,failed:2},{month:"May",completed:61,failed:1},{month:"Jun",completed:72,failed:2}],utilization:(await drones().find().limit(4).toArray()).map(d=>({name:d.id,value:Math.min(100,Math.round(d.flightHours/2.5))}))}}));
app.get("/api/geocode",async(req,res)=>{try{const q=String(req.query.q||"").trim();if(!q)return res.json({success:true,data:[]});const u=`https://nominatim.openstreetmap.org/search?format=jsonv2&limit=5&q=${encodeURIComponent(q)}`;const r=await fetch(u,{headers:{"User-Agent":"DroneOps-Student-Project/1.0"}});if(!r.ok)throw new Error();const data=await r.json() as any[];res.json({success:true,data:data.map(x=>({displayName:x.display_name,lat:Number(x.lat),lon:Number(x.lon)}))})}catch{res.status(502).json({success:false,message:"Location search unavailable"})}});

setInterval(async()=>{if(!db)return;const running=await missions().find({status:"In Progress"}).toArray();for(const m of running){const d=await drones().findOne({id:m.drone}),o=await operators().findOne({id:m.operator});if(!d)continue;const progress=Math.min(100,(m.progress||0)+5),battery=Math.max(0,d.battery-2);await drones().updateOne({id:d.id},{$set:{battery,flightHours:Number((d.flightHours+0.05).toFixed(2))}});await missions().updateOne({id:m.id},{$set:{progress,battery}});if(battery<=15){const exists=await alerts().findOne({resolved:false,message:new RegExp(`${d.id} battery`)});if(!exists)await alerts().insertOne({id:Date.now(),severity:"CRITICAL",message:`${d.id} battery critically low — ${battery}%`,time:"just now",resolved:false})}if(progress>=100){await missions().updateOne({id:m.id},{$set:{status:"Completed",progress:100}});await drones().updateOne({id:d.id},{$set:{status:battery<20?"Offline":"Available"}});if(o)await operators().updateOne({id:o.id},{$set:{status:"Available",missions:(o.missions||0)+1,flightHours:Number((o.flightHours+0.05).toFixed(2))}})}}for(const d of await drones().find({charging:true,status:"Charging"}).toArray()){const battery=Math.min(100,d.battery+5);await drones().updateOne({id:d.id},{$set:{battery,charging:battery<100,status:battery>=100?"Available":"Charging"}})}},5000);

async function start(){const client=new MongoClient(MONGO_URI);await client.connect();db=client.db("droneops");await seed();app.listen(PORT,()=>console.log(`DroneOps API running on port ${PORT}`));}
start().catch(e=>{console.error(e);process.exit(1)});
