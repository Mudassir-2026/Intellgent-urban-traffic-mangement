package com.traffic;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.context.annotation.Bean;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;
import org.springframework.web.servlet.config.annotation.CorsRegistry;
import org.springframework.web.servlet.config.annotation.InterceptorRegistry;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;
import org.springframework.web.server.ResponseStatusException;
import java.util.*;
import java.nio.file.*;
import java.util.concurrent.TimeUnit;

@SpringBootApplication
@RestController
@RequestMapping("/api")
public class TrafficSystemApplication {
  private final JdbcTemplate db;
  private final ObjectMapper json = new ObjectMapper();
  private final Map<String,Map<String,Object>> sessions = new java.util.concurrent.ConcurrentHashMap<>();
  public TrafficSystemApplication(JdbcTemplate db) { this.db=db; }
  public static void main(String[] args) { SpringApplication.run(TrafficSystemApplication.class,args); }
  @Bean WebMvcConfigurer webConfig(){ return new WebMvcConfigurer(){
    @Override public void addCorsMappings(CorsRegistry r){ r.addMapping("/api/**").allowedOrigins("*").allowedMethods("GET","POST","PUT","DELETE","OPTIONS").allowedHeaders("*"); }
    @Override public void addInterceptors(InterceptorRegistry r){ r.addInterceptor(new org.springframework.web.servlet.HandlerInterceptor(){
      @Override public boolean preHandle(jakarta.servlet.http.HttpServletRequest req,jakarta.servlet.http.HttpServletResponse res,Object handler){
        String path=req.getRequestURI();
        if(path.equals("/api/health")||path.equals("/api/auth/login")||path.equals("/api/auth/register")||path.equals("/api/auth/refresh")||req.getMethod().equals("OPTIONS"))return true;
        Map<String,Object> user=session(req.getHeader("Authorization")); String role=Objects.toString(user.get("role")); String method=req.getMethod();
        boolean operator=role.equals("ADMIN")||role.equals("TRAFFIC_OPERATOR");
        boolean emergency=operator||role.equals("EMERGENCY_OPERATOR");
        if(method.equals("DELETE")&&path.startsWith("/api/junctions/")&&!role.equals("ADMIN"))throw new ResponseStatusException(HttpStatus.FORBIDDEN,"Administrator role required");
        if((path.equals("/api/junctions")&&method.equals("POST"))||(path.contains("/optimize"))||(path.contains("/simulate"))||(path.contains("/lanes/upload"))||(path.startsWith("/api/signals/")&&method.equals("PUT"))||((path.equals("/api/junctions")||path.startsWith("/api/junctions/"))&&method.equals("PUT"))){ if(!operator)throw new ResponseStatusException(HttpStatus.FORBIDDEN,"Traffic operator role required"); }
        if(path.startsWith("/api/emergency/")&&method.equals("POST")&&!emergency)throw new ResponseStatusException(HttpStatus.FORBIDDEN,"Emergency operator role required");
        if(path.startsWith("/api/incidents/")&&method.equals("PUT")&&!operator)throw new ResponseStatusException(HttpStatus.FORBIDDEN,"Traffic operator role required");
        return true;
      }
    }).addPathPatterns("/api/**"); }
  }; }
  private List<Map<String,Object>> rows(String sql,Object...args){ return db.queryForList(sql,args); }
  private Map<String,Object> row(String sql,Object...args){ var list=rows(sql,args); if(list.isEmpty()) throw new ResponseStatusException(HttpStatus.NOT_FOUND,"Record not found"); return list.get(0); }
  private long num(Object x){ return ((Number)x).longValue(); }
  private int boundedHours(int hours){ return Math.max(1,Math.min(8760,hours)); }
  private double dbl(Map<String,Object> m,String key,double fallback){ Object v=m.get(key); return v instanceof Number?((Number)v).doubleValue():fallback; }
  private String str(Map<String,Object> m,String key,String fallback){ return Objects.toString(m.get(key),fallback); }
  private long insert(String sql,Object...args){ var k=new org.springframework.jdbc.support.GeneratedKeyHolder(); db.update(c->{var p=c.prepareStatement(sql,java.sql.Statement.RETURN_GENERATED_KEYS); for(int i=0;i<args.length;i++)p.setObject(i+1,args[i]); return p;},k); return Objects.requireNonNull(k.getKey()).longValue(); }

  @GetMapping("/health") public Map<String,Object> health(){ return Map.of("status","ok","mode","demo","env","local"); }
  @PostMapping("/auth/login") public Map<String,Object> login(@RequestBody Map<String,Object> b){
    String email=str(b,"email","").toLowerCase(Locale.ROOT), password=str(b,"password","");
    Map<String,String> demo=Map.of("admin@traffic-system.example","Admin@12345","operator@traffic-system.example","Operator@12345","emergency@traffic-system.example","Emergency@12345");
    if(!Objects.equals(demo.get(email),password)) throw new ResponseStatusException(HttpStatus.UNAUTHORIZED,"Incorrect email or password.");
    String role=email.startsWith("admin")?"ADMIN":email.startsWith("emergency")?"EMERGENCY_OPERATOR":"TRAFFIC_OPERATOR";
    Map<String,Object> user=Map.of("id",email,"email",email,"full_name",role.replace('_',' '),"role",role);
    String token=UUID.randomUUID().toString(); sessions.put(token,user);
    return Map.of("access_token",token,"refresh_token",token,"token_type","bearer","user",user);
  }
  @PostMapping("/auth/register") public Map<String,Object> register(@RequestBody Map<String,Object>b){ throw new ResponseStatusException(HttpStatus.NOT_IMPLEMENTED,"Account self-registration is disabled in this demo. Use one of the documented demo accounts."); }
  @GetMapping("/auth/me") public Map<String,Object> me(@RequestHeader(value="Authorization",required=false) String h){ return session(h); }
  @PostMapping("/auth/refresh") public Map<String,Object> refresh(@RequestBody Map<String,Object>b){ String token=str(b,"refresh_token",""); var u=sessions.get(token); if(u==null)throw new ResponseStatusException(HttpStatus.UNAUTHORIZED); return Map.of("access_token",token,"refresh_token",token,"token_type","bearer","user",u); }
  private Map<String,Object> session(String h){ if(h==null||!h.startsWith("Bearer "))throw new ResponseStatusException(HttpStatus.UNAUTHORIZED,"Authentication required"); var u=sessions.get(h.substring(7)); if(u==null)throw new ResponseStatusException(HttpStatus.UNAUTHORIZED,"Session expired"); return u; }

  private Map<String,Object> junctionView(long id){ Map<String,Object> j=row("SELECT id,name,latitude,longitude,approaches,active AS is_active,vehicle_count AS current_vehicle_count,CASE WHEN density_score<=30 THEN 'LOW' WHEN density_score<=55 THEN 'MEDIUM' WHEN density_score<=80 THEN 'HIGH' ELSE 'CRITICAL' END AS current_density,avg_wait_seconds AS avg_waiting_time_seconds FROM junctions WHERE id=?",id); j.put("signals",rows("SELECT id,direction AS approach_name,state,green_seconds AS green_duration_seconds,red_seconds AS red_duration_seconds,priority AS is_priority_active,15 AS min_green_seconds,90 AS max_green_seconds FROM signals WHERE junction_id=?",id)); return j; }
  @GetMapping("/junctions") public List<Map<String,Object>> junctions(){ List<Map<String,Object>> out=new ArrayList<>(); for(var j:rows("SELECT id FROM junctions WHERE active=1 ORDER BY id"))out.add(junctionView(num(j.get("id")))); return out; }
  @GetMapping("/junctions/{id}") public Map<String,Object> junction(@PathVariable long id){ return junctionView(id); }
  @PostMapping("/junctions") public Map<String,Object> createJunction(@RequestBody Map<String,Object>b){
    long id=insert("INSERT INTO junctions(name,latitude,longitude,approaches) VALUES(?,?,?,?)",str(b,"name","New Junction"),dbl(b,"latitude",0),dbl(b,"longitude",0),(int)dbl(b,"approaches",4));
    String[] dirs={"NORTH","SOUTH","EAST","WEST"}; for(String d:dirs)db.update("INSERT INTO signals(junction_id,direction) VALUES(?,?)",id,d); return junction(id);
  }
  @PutMapping("/junctions/{id}") public Map<String,Object> updateJunction(@PathVariable long id,@RequestBody Map<String,Object>b){ db.update("UPDATE junctions SET name=?,latitude=?,longitude=?,approaches=? WHERE id=?",str(b,"name","Junction"),dbl(b,"latitude",0),dbl(b,"longitude",0),(int)dbl(b,"approaches",4),id); return junction(id); }
  @DeleteMapping("/junctions/{id}") public Map<String,Object> disableJunction(@PathVariable long id){ db.update("UPDATE junctions SET active=0 WHERE id=?",id); return Map.of("status","disabled"); }
  @GetMapping("/signals") public List<Map<String,Object>> signals(){ return rows("SELECT s.*,j.name AS junction_name FROM signals s JOIN junctions j ON j.id=s.junction_id WHERE j.active=1 ORDER BY j.id,s.id"); }
  @PutMapping("/signals/{id}") public Map<String,Object> updateSignal(@PathVariable long id,@RequestBody Map<String,Object>b){ db.update("UPDATE signals SET state=?,green_seconds=?,red_seconds=? WHERE id=?",str(b,"state","RED"),(int)dbl(b,"green_seconds",30),(int)dbl(b,"red_seconds",90),id); return row("SELECT * FROM signals WHERE id=?",id); }
  @PostMapping("/signals/junctions/{id}/optimize") public Map<String,Object> optimize(@PathVariable long id){ Map<String,Object> j=junction(id); int green=(int)Math.max(15,Math.min(90,20+dbl(j,"density_score",0)*.65)); db.update("UPDATE signals SET green_seconds=?,red_seconds=? WHERE junction_id=?",green,Math.max(15,120-green),id); return Map.of("junction_id",id,"recommended_green_seconds",green,"signals",rows("SELECT * FROM signals WHERE junction_id=?",id)); }

  private Map<String,Object> simulate(long id){ Map<String,Object> j=junction(id); Random r=new Random(); int count=5+r.nextInt(31); double queue=Math.round((count*(2.0+r.nextDouble()*2.5))*10)/10.0, wait=Math.round((count*(1+r.nextDouble()*1.2))*10)/10.0;
    double score=Math.min(100,.35*Math.min(100,count/60.0*100)+.30*Math.min(100,queue/150*100)+.25*Math.min(100,wait/120*100)+.10*Math.min(100,count/40.0*100)); String level=score<=30?"LOW":score<=55?"MEDIUM":score<=80?"HIGH":"CRITICAL";
    insert("INSERT INTO traffic_records(junction_id,vehicle_count,queue_length_m,avg_wait_seconds,density_score,density_level,source) VALUES(?,?,?,?,?,?,?)",id,count,queue,wait,score,level,"SIMULATION"); db.update("UPDATE junctions SET vehicle_count=?,density_score=?,avg_wait_seconds=? WHERE id=?",count,score,wait,id);
    return Map.of("junction_id",id,"vehicle_count",count,"queue_length_m",queue,"avg_waiting_time_seconds",wait,"density_score",score,"density_level",level,"source","SIMULATION"); }
  @GetMapping("/traffic/live") public List<Map<String,Object>> live(){ return rows("SELECT j.id AS junction_id,j.name,j.latitude,j.longitude,j.vehicle_count,j.density_score,j.avg_wait_seconds AS avg_waiting_time_seconds,IF(EXISTS(SELECT 1 FROM signals s WHERE s.junction_id=j.id AND s.priority=1),1,0) AS active_emergency,COALESCE((SELECT t.source FROM traffic_records t WHERE t.junction_id=j.id ORDER BY t.created_at DESC LIMIT 1),'NO_DATA') AS data_source FROM junctions j WHERE j.active=1"); }
  @GetMapping("/traffic/history") public List<Map<String,Object>> history(@RequestParam(required=false,name="junction_id") Long id,@RequestParam(defaultValue="24") int hours){ int h=boundedHours(hours); String cutoff="DATE_SUB(NOW(),INTERVAL "+h+" HOUR)"; return id==null?rows("SELECT * FROM traffic_records WHERE created_at>="+cutoff+" ORDER BY created_at DESC"):rows("SELECT * FROM traffic_records WHERE junction_id=? AND created_at>="+cutoff+" ORDER BY created_at DESC",id); }
  @PostMapping("/traffic/simulate/{id}") public Map<String,Object> simulateOne(@PathVariable long id){ return simulate(id); }
  @PostMapping("/traffic/simulate-all") public Map<String,Object> simulateAll(){ List<Map<String,Object>> result=new ArrayList<>(); for(var j:junctions())result.add(simulate(num(j.get("id")))); return Map.of("count",result.size(),"results",result); }
  @PostMapping(value="/traffic/junctions/{id}/lanes/upload",consumes=MediaType.MULTIPART_FORM_DATA_VALUE)
  public Map<String,Object> upload(@PathVariable long id,@RequestParam Map<String,MultipartFile> files){
    junction(id);
    List<Path> temporaryFiles=new ArrayList<>(); Path resultFile=null; Path logFile=null;
    try {
      List<String> command=new ArrayList<>(); String python=System.getenv("AI_PYTHON");
      if(python!=null&&!python.isBlank()) command.add(python);
      else if(System.getProperty("os.name").toLowerCase(Locale.ROOT).contains("win")){ command.add("py"); command.add("-3.11"); }
      else command.add("python3.11");
      command.add(Path.of("ai","analyze_videos.py").toAbsolutePath().toString());
      resultFile=Files.createTempFile("traffic-analysis-",".json"); logFile=Files.createTempFile("traffic-analysis-",".log"); command.add(resultFile.toString());
      int accepted=0;
      for(String lane:List.of("lane_1","lane_2","lane_3","lane_4")){
        MultipartFile file=files.get(lane); if(file==null||file.isEmpty())continue;
        if(file.getSize()>500L*1024*1024)throw new ResponseStatusException(HttpStatus.PAYLOAD_TOO_LARGE,lane+" is over the 500 MB per-video limit.");
        String filename=Objects.toString(file.getOriginalFilename(),"").toLowerCase(Locale.ROOT);
        String ext=filename.lastIndexOf('.')>=0?filename.substring(filename.lastIndexOf('.')):".mp4";
        if(!Set.of(".mp4",".avi",".mov",".mkv",".mpeg",".mpg",".webm").contains(ext))throw new ResponseStatusException(HttpStatus.BAD_REQUEST,lane+" must be a supported video file (MP4, AVI, MOV, MKV, MPEG, or WEBM).");
        Path tmp=Files.createTempFile("traffic-"+lane+"-",ext); temporaryFiles.add(tmp); file.transferTo(tmp);
        command.add(lane+"="+tmp.toAbsolutePath()); accepted++;
      }
      if(accepted==0)throw new ResponseStatusException(HttpStatus.BAD_REQUEST,"Choose at least one lane video before uploading.");
      Process process=new ProcessBuilder(command).redirectErrorStream(true).redirectOutput(logFile.toFile()).start();
      if(!process.waitFor(20,TimeUnit.MINUTES)){process.destroyForcibly();throw new ResponseStatusException(HttpStatus.REQUEST_TIMEOUT,"Video analysis took longer than 20 minutes. Try shorter clips or fewer lanes.");}
      if(process.exitValue()!=0){String log=Files.readString(logFile); String detail=log.lines().filter(s->s.startsWith("Video analysis failed:")).reduce((a,b)->b).orElse("Video analysis failed. Check Python and the AI dependencies in backend/ai/requirements.txt."); throw new ResponseStatusException(HttpStatus.UNPROCESSABLE_ENTITY,detail);}
      @SuppressWarnings("unchecked") Map<String,Object> analysis=json.readValue(resultFile.toFile(),Map.class);
      @SuppressWarnings("unchecked") List<Map<String,Object>> lanes=(List<Map<String,Object>>)analysis.get("lanes");
      int totalVehicles=0, peakVehicles=0; boolean possibleEmergency=Boolean.TRUE.equals(analysis.get("any_possible_emergency_vehicle"));
      for(Map<String,Object> lane:lanes){
        totalVehicles+=((Number)lane.get("total_vehicles")).intValue(); peakVehicles+=((Number)lane.get("peak_visible_vehicles")).intValue();
      }
      List<Map<String,Object>> rankedLanes=new ArrayList<>(lanes);
      rankedLanes.sort(Comparator.comparingInt((Map<String,Object> lane)->((Number)lane.get("peak_visible_vehicles")).intValue()).reversed());
      int highestDemand=rankedLanes.isEmpty()?0:((Number)rankedLanes.get(0).get("peak_visible_vehicles")).intValue();
      for(int rank=0;rank<rankedLanes.size();rank++){
        Map<String,Object> lane=rankedLanes.get(rank); int demand=((Number)lane.get("peak_visible_vehicles")).intValue();
        String advisory=highestDemand==0?"RED":rank==0?"GREEN":rank==1&&demand>0?"AMBER":"RED";
        String reason=advisory.equals("GREEN")?"Highest detected peak density — recommended right-of-way.":advisory.equals("AMBER")?"Next highest detected demand — next-phase candidate.":highestDemand==0?"No vehicles detected reliably in the analyzed clips.":"Wait while the highest-demand lane receives priority.";
        lane.put("signal_advisory",advisory); lane.put("signal_priority_rank",rank+1); lane.put("signal_advisory_reason",reason); lane.put("signal_advisory_note","Video-based advisory only; does not control a physical signal.");
      }
      double queue=peakVehicles*5.5, score=Math.min(100,.35*Math.min(100,peakVehicles/60.0*100)+.30*Math.min(100,queue/150*100)+.25*0+.10*Math.min(100,peakVehicles/40.0*100));
      String level=score<=30?"LOW":score<=55?"MEDIUM":score<=80?"HIGH":"CRITICAL";
      insert("INSERT INTO traffic_records(junction_id,vehicle_count,queue_length_m,avg_wait_seconds,density_score,density_level,source) VALUES(?,?,?,?,?,?,?)",id,totalVehicles,queue,0,score,level,"AI_VIDEO");
      db.update("UPDATE junctions SET vehicle_count=?,density_score=?,avg_wait_seconds=0 WHERE id=?",peakVehicles,score,id);
      Map<String,Object> trafficRecord=new LinkedHashMap<>(); trafficRecord.put("junction_id",id); trafficRecord.put("vehicle_count",totalVehicles); trafficRecord.put("peak_visible_vehicles",peakVehicles); trafficRecord.put("queue_length_m_estimate",Math.round(queue*10.0)/10.0); trafficRecord.put("avg_waiting_time_seconds",null); trafficRecord.put("density_score",Math.round(score*10.0)/10.0); trafficRecord.put("density_level",level); trafficRecord.put("source","AI_VIDEO");
      analysis.put("traffic_record",trafficRecord); analysis.put("junction",junctionView(id)); analysis.put("analysis_source","AI_VIDEO"); analysis.put("possible_emergency_vehicle_requires_operator_confirmation",possibleEmergency);
      long analysisId=insert("INSERT INTO video_analyses(junction_id,total_vehicles,peak_visible_vehicles,density_score,density_level,analysis_json) VALUES(?,?,?,?,?,'{}')",id,totalVehicles,peakVehicles,score,level);
      analysis.put("analysis_id",analysisId); analysis.put("analyzed_at",java.time.OffsetDateTime.now().toString());
      db.update("UPDATE video_analyses SET analysis_json=? WHERE id=?",json.writeValueAsString(analysis),analysisId);
      return analysis;
    } catch(ResponseStatusException e){throw e;}
      catch(InterruptedException e){Thread.currentThread().interrupt();throw new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE,"Video analysis was interrupted.");}
      catch(Exception e){throw new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE,"Could not run video analysis. Install Python 3.11+ and backend/ai/requirements.txt, then restart the backend.",e);}
    finally { for(Path p:temporaryFiles)try{Files.deleteIfExists(p);}catch(Exception ignored){} if(resultFile!=null)try{Files.deleteIfExists(resultFile);}catch(Exception ignored){} if(logFile!=null)try{Files.deleteIfExists(logFile);}catch(Exception ignored){} }
  }
  @GetMapping("/traffic/junctions/{id}/lanes/latest") public Map<String,Object> latestVideoAnalysis(@PathVariable long id){
    junction(id); var saved=row("SELECT analysis_json FROM video_analyses WHERE junction_id=? ORDER BY created_at DESC,id DESC LIMIT 1",id);
    try { @SuppressWarnings("unchecked") Map<String,Object> result=json.readValue(Objects.toString(saved.get("analysis_json")),Map.class); return result; }
    catch(Exception e){throw new ResponseStatusException(HttpStatus.INTERNAL_SERVER_ERROR,"Saved video analysis could not be read.",e);}
  }

  @GetMapping("/incidents") public List<Map<String,Object>> incidents(){ return rows("SELECT * FROM incidents ORDER BY created_at DESC"); }
  @PostMapping("/incidents") public Map<String,Object> createIncident(@RequestBody Map<String,Object>b){ long id=insert("INSERT INTO incidents(type,latitude,longitude,description,severity) VALUES(?,?,?,?,?)",str(b,"type","OTHER"),dbl(b,"latitude",0),dbl(b,"longitude",0),b.get("description"),str(b,"severity","MEDIUM")); return row("SELECT * FROM incidents WHERE id=?",id); }
  @PutMapping("/incidents/{id}") public Map<String,Object> updateIncident(@PathVariable long id,@RequestBody Map<String,Object>b){ db.update("UPDATE incidents SET status=?,severity=COALESCE(?,severity) WHERE id=?",str(b,"status","OPEN"),b.get("severity"),id); return row("SELECT * FROM incidents WHERE id=?",id); }
  @GetMapping("/emergency/events") public List<Map<String,Object>> emergencies(){ return rows("SELECT * FROM emergency_events ORDER BY created_at DESC"); }
  @PostMapping("/emergency/events") public Map<String,Object> reportEmergency(@RequestBody Map<String,Object>b){ long id=insert("INSERT INTO emergency_events(vehicle_type,origin_lat,origin_lng,destination_lat,destination_lng,status) VALUES(?,?,?,?,?,'ROUTE_CALCULATED')",str(b,"vehicle_type","AMBULANCE"),dbl(b,"origin_lat",0),dbl(b,"origin_lng",0),dbl(b,"destination_lat",0),dbl(b,"destination_lng",0)); return row("SELECT * FROM emergency_events WHERE id=?",id); }
  @GetMapping("/emergency/events/{id}/route") public Map<String,Object> route(@PathVariable long id){ var e=row("SELECT * FROM emergency_events WHERE id=?",id); List<Map<String,Object>> js=junctions(); List<Long> seq=new ArrayList<>(); for(var j:js)seq.add(num(j.get("id"))); return Map.of("emergency_event_id",id,"junction_sequence",seq,"total_distance_meters",js.size()*850,"estimated_travel_seconds",js.size()*120,"event",e); }
  @PostMapping("/emergency/{id}/activate") public Map<String,Object> activate(@PathVariable long id){ row("SELECT * FROM emergency_events WHERE id=?",id); db.update("UPDATE emergency_events SET status='PRIORITY_ACTIVE' WHERE id=?",id); db.update("UPDATE signals SET state='GREEN',priority=1 WHERE junction_id IN (SELECT id FROM junctions WHERE active=1)"); return Map.of("id",id,"status","PRIORITY_ACTIVE"); }
  @PostMapping("/emergency/{id}/complete") public Map<String,Object> complete(@PathVariable long id){ row("SELECT * FROM emergency_events WHERE id=?",id); db.update("UPDATE emergency_events SET status='COMPLETED' WHERE id=?",id); db.update("UPDATE signals SET state='RED',priority=0 WHERE priority=1"); return Map.of("id",id,"status","COMPLETED"); }
  @GetMapping("/analytics") public Map<String,Object> analytics(@RequestParam(defaultValue="24") int hours){
    int h=boundedHours(hours); String cutoff="DATE_SUB(NOW(),INTERVAL "+h+" HOUR)";
    Map<String,Object> t=row("SELECT COALESCE(SUM(vehicle_count),0) total_vehicles,ROUND(COALESCE(AVG(density_score),0),1) avg_density_score,ROUND(COALESCE(AVG(avg_wait_seconds),0),1) avg_waiting_time_seconds,COUNT(*) samples FROM traffic_records WHERE created_at>="+cutoff);
    Map<String,Object> breakdown=new LinkedHashMap<>(); for(String level:List.of("LOW","MEDIUM","HIGH","CRITICAL"))breakdown.put(level,db.queryForObject("SELECT COUNT(*) FROM traffic_records WHERE density_level=? AND created_at>="+cutoff,Long.class,level));
    List<Map<String,Object>> performance=rows("SELECT j.id junction_id,j.name junction_name,ROUND(AVG(t.density_score),1) avg_density_score,ROUND(AVG(t.avg_wait_seconds),1) avg_waiting_time_seconds,COUNT(t.id) sample_count FROM junctions j LEFT JOIN traffic_records t ON t.junction_id=j.id AND t.created_at>="+cutoff+" WHERE j.active=1 GROUP BY j.id,j.name");
    Map<String,Object> comparison=Map.of("note","Simulation estimate based on the traffic records in the selected time window.","intelligent_avg_wait_seconds",t.get("avg_waiting_time_seconds"),"fixed_signal_avg_wait_seconds",Math.round(((Number)t.get("avg_waiting_time_seconds")).doubleValue()*1.25),"improvement_percent",20);
    Map<String,Object> byType=new LinkedHashMap<>(); for(var x:rows("SELECT type,COUNT(*) count FROM incidents WHERE created_at>="+cutoff+" GROUP BY type"))byType.put(Objects.toString(x.get("type")),x.get("count"));
    List<Map<String,Object>> hourly=rows("SELECT DATE_FORMAT(created_at,'%Y-%m-%d %H:00') AS hour_bucket,SUM(vehicle_count) vehicles FROM traffic_records WHERE created_at>="+cutoff+" GROUP BY hour_bucket ORDER BY hour_bucket");
    List<Map<String,Object>> sources=rows("SELECT source,COUNT(*) sample_count FROM traffic_records WHERE created_at>="+cutoff+" GROUP BY source");
    Map<String,Object> result=new LinkedHashMap<>(); result.put("hours",h); result.put("total_vehicles",t.get("total_vehicles")); result.put("avg_density_score",t.get("avg_density_score")); result.put("avg_waiting_time_seconds",t.get("avg_waiting_time_seconds")); result.put("avg_emergency_response_seconds",null); result.put("vehicles_per_hour",hourly); result.put("density_breakdown",breakdown); result.put("junction_performance",performance); result.put("performance_comparison",comparison); result.put("incidents_by_type",byType); result.put("source_breakdown",sources); result.put("data_source",sources.stream().anyMatch(s->"AI_VIDEO".equals(s.get("source")))?"MIXED — VIDEO ANALYSIS AND SIMULATION":"SIMULATED"); return result;
  }
}
