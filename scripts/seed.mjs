import { createClient } from '@supabase/supabase-js'

const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
if (!url || !key) { console.error('Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.local'); process.exit(1) }
const supabase = createClient(url, key)

const instructors = [
  'Capt. James Rivera', 'Dr. Sarah Chen', 'Prof. Michael Torres',
  'Capt. Lisa Nakamura', 'Dr. Robert Hayes', 'Prof. Karen Mitchell',
  'Capt. David Park', 'Dr. Amanda Foster', 'Prof. Thomas Blake',
]
const pick = (i) => instructors[i % instructors.length]

function q(question, options, correct, explanation) {
  return { question, options, correct, explanation }
}

const COURSES = [
  { code:'AES 1040', title:'Introduction to Unmanned Aircraft Systems', credits:3, cat:'Technical', pre:'None', inst:pick(0),
    desc:'Operational knowledge of unmanned aircraft systems (UAS) including small, medium, and large aviation vehicles, ground control stations, remote split operations, line-of-site operations, payloads, limitations, and emergency procedures.',
    ch:[{t:'UAS Fundamentals',l:[{t:'History and Evolution of UAS',c:'Overview of unmanned aircraft development from military origins to modern commercial applications.',d:45},{t:'UAS Classifications',c:'Small, medium, and large UAS categories including weight classes and operational capabilities.',d:40},{t:'Regulatory Framework',c:'FAA Part 107 regulations and airspace requirements for UAS operations.',d:50}]},{t:'Ground Control and Operations',l:[{t:'Ground Control Stations',c:'Components, interfaces, and operation of GCS for various UAS platforms.',d:45},{t:'Line-of-Sight Operations',c:'Visual line-of-sight requirements, operational limitations, and best practices.',d:35},{t:'Remote Split Operations',c:'Beyond visual line-of-sight operations and communication links.',d:40}]},{t:'Payloads and Emergency Procedures',l:[{t:'UAS Payloads',c:'Camera systems, sensors, and specialized payload configurations.',d:40},{t:'Emergency Procedures',c:'Lost link procedures, return-to-home protocols, and emergency landings.',d:50}]}],
    quiz:[q('What does GCS stand for in UAS operations?',['Global Communication System','Ground Control Station','General Command Setup','Guided Control Software'],1,'GCS stands for Ground Control Station.'),q('Under FAA Part 107, what is the maximum altitude for small UAS operations?',['200 feet AGL','300 feet AGL','400 feet AGL','500 feet AGL'],2,'FAA Part 107 limits small UAS to 400 feet AGL.'),q('What is VLOS in UAS terminology?',['Variable Line of Sight','Visual Line of Sight','Vertical Line of Safety','Virtual Link Operation System'],1,'VLOS stands for Visual Line of Sight.'),q('What happens when a UAS loses its communication link?',['Continue automatically','Return to home/launch point','Climb to max altitude','Circle indefinitely'],1,'Most UAS return to launch point on lost link.'),q('Which UAS category weighs less than 55 pounds?',['Large UAS','Medium UAS','Small UAS','Micro UAS'],2,'Small UAS under Part 107 weigh less than 55 lbs.')]},
  { code:'AES 1050', title:'Introduction to Space', credits:3, cat:'Technical', pre:'None', inst:pick(1),
    desc:'Introduces students to challenges of working in space. Course activities lead to design and construction of a working satellite for launch.',
    ch:[{t:'Space Environment',l:[{t:'The Space Environment',c:'Vacuum, radiation, thermal extremes, and microgravity.',d:45},{t:'Orbital Mechanics Basics',c:'Kepler laws, orbital parameters, and satellite trajectories.',d:50}]},{t:'Satellite Design',l:[{t:'Satellite Subsystems',c:'Power, communication, attitude control, and thermal management.',d:45},{t:'CubeSat Architecture',c:'Standardized small satellite platforms and design considerations.',d:40}]}],
    quiz:[q('What is the primary challenge of the space environment for electronics?',['Wind','Cosmic radiation','High gravity','Pressure'],1,'Cosmic radiation damages electronics in space.'),q('Who formulated the three laws of planetary motion?',['Newton','Kepler','Galileo','Einstein'],1,'Johannes Kepler formulated the three laws of planetary motion.'),q('What is a CubeSat?',['Cubic meter satellite','Standardized small satellite (10cm cube units)','Communication satellite','Geostationary satellite'],1,'CubeSats use 10cm cube units as building blocks.')]},
  { code:'AES 1100', title:'Aviation Fundamentals', credits:6, cat:'General', pre:'None', inst:pick(2),
    desc:'Fundamentals of aviation including airplane components, aerodynamics, aircraft systems, airport environment, ATC procedures, FARs, air navigation, and aviation weather. Prepares for FAA Private Pilot Knowledge exam.',
    ch:[{t:'Aircraft and Aerodynamics',l:[{t:'Parts of an Airplane',c:'Fuselage, wings, empennage, landing gear, and powerplant.',d:45},{t:'Principles of Flight',c:'Bernoulli principle, four forces: lift, weight, thrust, drag.',d:50},{t:'Flight Controls',c:'Ailerons, elevator, rudder, flaps, and trim.',d:40}]},{t:'Aircraft Systems',l:[{t:'Engine and Propulsion',c:'Reciprocating engine operations, carburetor and fuel injection.',d:45},{t:'Flight Instruments',c:'Pitot-static system, gyroscopic instruments, magnetic compass.',d:50},{t:'Electrical and Fuel Systems',c:'Aircraft electrical components, fuel types, and operations.',d:40}]},{t:'Navigation and Regulations',l:[{t:'Aviation Charts and Navigation',c:'Sectional charts, pilotage, dead reckoning, radio navigation.',d:50},{t:'Airspace Classifications',c:'Class A through G, special use airspace, TFRs.',d:45},{t:'Federal Aviation Regulations',c:'FAR Part 61 and Part 91 for private pilots.',d:50}]},{t:'Weather and Airport Ops',l:[{t:'Aviation Weather Basics',c:'Atmosphere, pressure, temperature, weather patterns.',d:45},{t:'Weather Reports',c:'METARs, TAFs, AIRMETs, SIGMETs, PIREPs.',d:40},{t:'Airport Operations',c:'Runway markings, lighting, taxi procedures, ATC comms.',d:45}]}],
    quiz:[q('What are the four forces on an aircraft in flight?',['Lift, Weight, Thrust, Drag','Push, Pull, Rise, Fall','Lift, Gravity, Speed, Friction','Power, Mass, Velocity, Resistance'],0,'The four forces are Lift, Weight, Thrust, and Drag.'),q('Which instrument indicates altitude?',['Airspeed indicator','Altimeter','VSI','Turn coordinator'],1,'The altimeter indicates altitude.'),q('What does METAR stand for?',['Meteorological Terminal Air Report','Meteorological Aerodrome Report','Main Environmental Assessment','Measured Environmental Temperature'],1,'METAR = Meteorological Aerodrome Report.'),q('Class B airspace surrounds which airports?',['Small rural','Major busy (large hub)','Military','Seaplane bases'],1,'Class B surrounds the busiest airports.'),q('What is the purpose of ailerons?',['Control pitch','Control roll','Control yaw','Increase lift'],1,'Ailerons control roll (banking).'),q('What fuel is used in piston-engine aircraft?',['Jet A','Jet B','100LL AvGas','Diesel'],2,'100LL AvGas is standard for piston engines.')]},
  { code:'AES 1400', title:'Aviation Weather', credits:3, cat:'General', pre:'AES 1100', inst:pick(3),
    desc:'Basic meteorological concepts for aviation. Emphasis on NWS reports and forecasts. Prepares for weather section of FAA Private Pilot Knowledge exam.',
    ch:[{t:'Atmospheric Science',l:[{t:'The Atmosphere',c:'Composition, layers, properties.',d:40},{t:'Temperature and Pressure',c:'Lapse rates, pressure systems.',d:45},{t:'Moisture and Precipitation',c:'Humidity, dew point, cloud formation.',d:40}]},{t:'Weather Hazards',l:[{t:'Thunderstorms',c:'Life cycle, hazards, avoidance.',d:50},{t:'Icing and Turbulence',c:'Types of icing, turbulence categories.',d:45},{t:'Fog and Visibility',c:'Fog types, reduced visibility hazards.',d:40}]},{t:'Weather Services',l:[{t:'METARs and TAFs',c:'Decoding observations and forecasts.',d:45},{t:'Weather Charts',c:'Surface analysis, winds aloft, prog charts.',d:50}]}],
    quiz:[q('What is the standard lapse rate?',['1°C/1000ft','2°C/1000ft','3°C/1000ft','4°C/1000ft'],1,'Standard lapse rate is 2°C per 1000 feet.'),q('What provides actual observed conditions?',['TAF','METAR','AIRMET','SIGMET'],1,'METAR is an actual weather observation.'),q('Which icing type is most hazardous?',['Rime','Clear','Mixed','Frost'],1,'Clear ice is most hazardous.'),q('TAF validity period?',['6 hours','12 hours','24 or 30 hours','48 hours'],2,'TAFs are valid for 24 or 30 hours.'),q('What causes radiation fog?',['Warm air over cold water','Ground cooling on clear calm nights','Mountain wind','Frontal lifting'],1,'Ground cooling on clear calm nights.')]},
  { code:'AES 1500', title:'Private Flight', credits:1, cat:'Certification', pre:'Permission of instructor', inst:pick(4),
    desc:'Enables student to earn FAA Private Pilot certificate under Part 61 or 141. Minimum 35 hours flight time required.',
    ch:[{t:'Flight Training',l:[{t:'Basic Maneuvers',c:'Straight-and-level, turns, climbs, descents.',d:45},{t:'Takeoffs and Landings',c:'Normal, crosswind, short-field, soft-field.',d:50}]},{t:'Checkride Prep',l:[{t:'Cross-Country Navigation',c:'Flight planning, navigation, fuel management.',d:50},{t:'Practical Test',c:'ACS standards, oral exam, flight review.',d:45}]}],
    quiz:[q('Min flight time for Private Pilot under Part 61?',['20 hrs','30 hrs','40 hrs','50 hrs'],2,'Part 61 requires 40 hours minimum.'),q('Before solo, what must a student have?',['Commercial cert','Instructor endorsement','Instrument rating','ATP'],1,'Instructor endorsement required before solo.'),q('What must a private pilot carry?',['Only license','Pilot cert and photo ID','Pilot cert, medical, and photo ID','Only medical'],2,'Must carry pilot cert, medical, and photo ID.')]},
  { code:'AES 1710', title:'Instrument Flight Simulation I', credits:3, cat:'Navigation', pre:'None', inst:pick(5),
    desc:'Basic flight instruments, radio navigation, aviation weather, aircraft performance, weight and balance, crew coordination, and aeronautical decision-making in flight training devices.',
    ch:[{t:'Flight Instruments',l:[{t:'Pitot-Static Instruments',c:'Airspeed indicator, altimeter, VSI.',d:50},{t:'Gyroscopic Instruments',c:'Attitude indicator, heading indicator, turn coordinator.',d:45},{t:'Instrument Scanning',c:'Cross-check, interpretation, and control.',d:40}]},{t:'Radio Navigation',l:[{t:'VOR Navigation',c:'VHF Omnidirectional Range principles.',d:50},{t:'GPS Basics',c:'Satellite-based navigation fundamentals.',d:45}]}],
    quiz:[q('Which instrument is NOT pitot-static?',['Airspeed indicator','Altimeter','Attitude indicator','VSI'],2,'Attitude indicator is gyroscopic, not pitot-static.'),q('What does a VOR provide?',['Distance','Magnetic bearing to/from station','Ground speed','Wind direction'],1,'VOR provides magnetic bearing information.'),q('When does VSI show zero?',['Climbing','Level flight','Descending','Turning'],1,'VSI shows zero in level flight.'),q('In IMSAFE, what does S stand for?',['Speed','Stress','Safety','Situation'],1,'S stands for Stress in IMSAFE.')]},
  { code:'AES 2050', title:'Aviation and Aerospace History', credits:3, cat:'General', pre:'None', inst:pick(7),
    desc:'How individuals and events influenced aviation and aerospace development from early myths to modern advances.',
    ch:[{t:'Early Aviation',l:[{t:'Pioneers of Flight',c:'Wright Brothers, Santos-Dumont, early milestones.',d:45},{t:'World War Aviation',c:'WWI and WWII aircraft development.',d:50}]},{t:'Modern Era',l:[{t:'The Jet Age',c:'Jet propulsion, commercial aviation, supersonic flight.',d:45},{t:'Space Exploration',c:'Mercury, Gemini, Apollo programs.',d:50}]}],
    quiz:[q('Who made the first powered flight in 1903?',['Lindbergh','Earhart','Wright Brothers','Santos-Dumont'],2,'Wright Brothers at Kitty Hawk, December 17, 1903.'),q('First jet commercial airliner?',['Boeing 707','de Havilland Comet','DC-8','Concorde'],1,'de Havilland Comet in 1952.'),q('Which Apollo mission first landed on the Moon?',['Apollo 1','Apollo 8','Apollo 11','Apollo 13'],2,'Apollo 11 on July 20, 1969.')]},
  { code:'AES 2120', title:'Instrument Fundamentals', credits:4, cat:'Navigation', pre:'AES 1100, AES 1400', inst:pick(0),
    desc:'Aeronautics, regulations, meteorology, and instrument procedures for FAA instrument knowledge exam.',
    ch:[{t:'IFR Procedures',l:[{t:'Departure Procedures',c:'SIDs, ODPs, obstacle clearance.',d:50},{t:'Enroute Operations',c:'Victor airways, MEAs, MOCAs.',d:50},{t:'Instrument Approaches',c:'Precision and non-precision approaches, minimums.',d:55}]},{t:'Navigation Systems',l:[{t:'VOR/ILS Approaches',c:'Ground-based navigation and approach procedures.',d:50},{t:'GPS/RNAV Approaches',c:'WAAS, LPV approaches.',d:45}]}],
    quiz:[q('Minimum IFR fuel reserve?',['30 min','45 min','60 min','90 min'],1,'45 minutes reserve required.'),q('What approach provides lateral AND vertical guidance?',['VOR','NDB','ILS','Circling'],2,'ILS provides both localizer and glide slope.'),q('What does MEA stand for?',['Maximum Elevation Altitude','Minimum Enroute Altitude','Minimum Emergency Altitude','Maximum Enroute Authority'],1,'Minimum Enroute Altitude.'),q('What does WAAS provide?',['Wider airspace','Improved GPS accuracy for LPV approaches','Weather alerts','Authentication'],1,'WAAS improves GPS accuracy for precision-like approaches.')]},
  { code:'AES 2130', title:'Commercial Flight Operations', credits:3, cat:'Operations', pre:'AES 2120', inst:pick(1),
    desc:'Aeronautics, regulations, complex aircraft systems, and ADM for commercial operations. Prepares for FAA commercial knowledge exam.',
    ch:[{t:'Commercial Privileges',l:[{t:'Requirements',c:'FAR Part 61 Subpart F requirements.',d:45},{t:'Complex Aircraft',c:'Retractable gear, constant-speed prop, high-perf.',d:50}]},{t:'Advanced Aeronautics',l:[{t:'Advanced Aerodynamics',c:'Load factor, maneuvering speed, performance.',d:50},{t:'Commercial Maneuvers',c:'Chandelles, lazy eights, steep spirals.',d:45}]}],
    quiz:[q('Min age for Commercial certificate?',['16','17','18','21'],2,'Must be 18 for Commercial.'),q('What defines a complex aircraft?',['Over 200 HP','Retractable gear, flaps, controllable-pitch prop','Turbine engine','Pressurized cabin'],1,'Complex = retractable gear, flaps, controllable prop.'),q('What is a chandelle?',['Lazy eight','Maximum performance climbing 180° turn','Steep spiral','Pylon eight'],1,'Chandelle is a max performance climbing 180° turn.')]},
  { code:'AES 2200', title:'Fundamentals of Air Traffic Control', credits:4, cat:'Operations', pre:'AES 1100', inst:pick(2),
    desc:'ATC services, procedures, communications, radar operations, and simulator lab exercises.',
    ch:[{t:'ATC Fundamentals',l:[{t:'ATC System',c:'History, organization, mission.',d:45},{t:'Phraseology',c:'Standard communication, readbacks, clearances.',d:50},{t:'Airspace',c:'Controlled, uncontrolled, special use.',d:45}]},{t:'Radar Ops',l:[{t:'Radar Systems',c:'Primary, secondary radar, transponder codes.',d:50},{t:'Separation',c:'Radar/non-radar separation, wake turbulence.',d:55}]}],
    quiz:[q('Emergency transponder code?',['7500','7600','7700','1200'],2,'7700 = emergency.'),q('Squawk 7500 indicates?',['Comm failure','Emergency','Hijacking','VFR'],2,'7500 = hijacking.'),q('What does Roger mean?',['Yes','I received your message','Permission granted','Stand by'],1,'Roger = I received your message.'),q('Guard frequency?',['118.0','121.5','122.0','126.7'],1,'121.5 MHz is the emergency frequency.')]},
  { code:'AES 2500', title:'Instrument Flight', credits:1, cat:'Certification', pre:'AES 1100', inst:pick(5),
    desc:'FAA Instrument rating. Minimum 40 hours instrument flight time required.',
    ch:[{t:'Instrument Rating',l:[{t:'IFR Training',c:'Approaches, holding, cross-country requirements.',d:50},{t:'Checkride Prep',c:'ACS standards, oral, practical test.',d:45}]}],
    quiz:[q('Hours required for instrument rating?',['20','30','40','50'],2,'40 hours instrument time required.'),q('What is a holding pattern?',['Parking area','Racetrack delay maneuver','Maintenance check','Emergency only'],1,'Racetrack-shaped maneuver to delay arrival.'),q('What does IFR stand for?',['Instrument Flying Rules','Instrument Flight Rules','International Flight Regs','In-Flight Requirements'],1,'Instrument Flight Rules.')]},
  { code:'AES 2710', title:'Instrument Flight Simulation II', credits:3, cat:'Navigation', pre:'AES 2120', inst:pick(7),
    desc:'IFR flight planning, navigation, situational awareness. ATC clearances, holding patterns, precision and non-precision approaches, emergency procedures.',
    ch:[{t:'IFR Operations',l:[{t:'IFR Planning',c:'Route selection, fuel, weather analysis.',d:50},{t:'ATC Clearances',c:'Copying, reading back clearances.',d:45}]},{t:'Approaches',l:[{t:'Precision Approaches',c:'ILS, LPV, GLS procedures.',d:55},{t:'Non-Precision Approaches',c:'VOR, NDB, LNAV, circling.',d:50},{t:'Holding and Missed',c:'Entries, timing, missed approach.',d:45}]}],
    quiz:[q('Three types of holding entries?',['Left, right, center','Direct, teardrop, parallel','Standard, modified, emergency','Fast, slow, normal'],1,'Direct, teardrop, and parallel entries.'),q('What does LPV stand for?',['Lateral Precision Vectoring','Localizer Performance with Vertical guidance','Low Power Visual','Landing Precision Vertical'],1,'Localizer Performance with Vertical guidance.'),q('First action in missed approach?',['Turn immediately','Apply full power and climb','Contact ATC','Retract flaps'],1,'Apply full power and climb.')]},
  { code:'AES 3000', title:'Aircraft Systems and Propulsion', credits:3, cat:'Technical', pre:'AES 1100, PHY 1250', inst:pick(0),
    desc:'Aircraft nomenclature, design, systems. Internal combustion and turbojet engines, fuel, electrical, hydraulic, and pneumatic systems.',
    ch:[{t:'Engines',l:[{t:'Reciprocating',c:'Four-stroke cycle, components, power production.',d:50},{t:'Turbine Engines',c:'Gas turbine cycle, compressor, combustion, turbine.',d:55}]},{t:'Systems',l:[{t:'Hydraulic/Pneumatic',c:'Fluid power for controls, gear, brakes.',d:45},{t:'Electrical',c:'Generation, distribution, protection.',d:45}]}],
    quiz:[q('Strokes in one engine cycle?',['2','3','4','6'],2,'Four strokes: intake, compression, power, exhaust.'),q('Most common engine in large commercial aircraft?',['Reciprocating','Turboprop','Turbofan','Ramjet'],2,'Turbofan engines are standard on airliners.'),q('What drives the alternator?',['Electric motor','Engine accessory drive','Battery','Wind turbine'],1,'Engine accessory gear drive powers the alternator.')]},
  { code:'AES 3220', title:'Aviation and Aerospace Law', credits:3, cat:'General', pre:'AES 1100, Junior standing', inst:pick(2),
    desc:'Aviation and space law. Constitutional, administrative, contract, tort law. Aviation liability and space law principles.',
    ch:[{t:'Aviation Law',l:[{t:'History',c:'Air Commerce Act to modern regulations.',d:45},{t:'FAA Authority',c:'Structure, rulemaking, enforcement.',d:40}]},{t:'Liability and Space Law',l:[{t:'Aviation Liability',c:'Product liability, negligence.',d:50},{t:'International Aviation',c:'ICAO, bilateral agreements.',d:45},{t:'Space Law',c:'Outer Space Treaty, commercial space regulations.',d:45}]}],
    quiz:[q('Governing international civil aviation body?',['FAA','ICAO','NTSB','EASA'],1,'ICAO sets international standards.'),q('What act established the FAA?',['Air Commerce Act 1926','Federal Aviation Act 1958','Deregulation Act 1978','Safety Act 2000'],1,'Federal Aviation Act of 1958.'),q('What treaty governs outer space?',['Geneva Convention','Outer Space Treaty 1967','Paris Convention','Warsaw Convention'],1,'Outer Space Treaty of 1967.')]},
  { code:'AES 3230', title:'Airline Management', credits:3, cat:'Operations', pre:'Junior standing', inst:pick(3),
    desc:'Airline industry history, organization, economics, labor relations, financing, international aviation.',
    ch:[{t:'Industry',l:[{t:'History',c:'Deregulation, mergers, modern industry.',d:45},{t:'Organization',c:'Corporate structure, departments.',d:40}]},{t:'Economics',l:[{t:'Revenue Management',c:'Yield, load factors, costs.',d:50},{t:'Labor Relations',c:'Unions, bargaining, workforce.',d:45}]}],
    quiz:[q('Airline Deregulation Act year?',['1926','1958','1978','2001'],2,'1978 Airline Deregulation Act.'),q('What is load factor?',['Max weight','Percentage of seats filled','Cargo limit','Structural limit'],1,'Percentage of available seats occupied.'),q('Three major airline alliances?',['Delta/United/American','Star Alliance/oneworld/SkyTeam','IATA/ICAO/FAA','Boeing/Airbus/Embraer'],1,'Star Alliance, oneworld, SkyTeam.')]},
  { code:'AES 3460', title:'Weather for Aircrews', credits:3, cat:'Safety', pre:'AES 1400, Junior standing', inst:pick(7),
    desc:'Advanced aviation weather: stability, turbulence, CAT, icing, jet stream, airborne radar.',
    ch:[{t:'Advanced Weather',l:[{t:'Stability and Turbulence',c:'Atmospheric stability, turbulence prediction.',d:50},{t:'Clear-Air Turbulence',c:'CAT causes, detection, avoidance.',d:45},{t:'Icing',c:'Ice types, accumulation, de-icing.',d:50}]},{t:'Operations',l:[{t:'Jet Stream',c:'Patterns, wind shear, flight planning.',d:45},{t:'Airborne Radar',c:'Operation, interpretation, storm avoidance.',d:50}]}],
    quiz:[q('What causes CAT?',['Thunderstorms','Wind shear near jet streams','Low altitude wind','Sea breeze'],1,'Wind shear at jet stream boundaries.'),q('Most dangerous icing type?',['Rime','Clear/glaze','Frost','Mixed'],1,'Clear ice is heaviest and hardest to remove.'),q('What radar color = most severe?',['Green','Yellow','Red/Magenta','Blue'],2,'Red/magenta indicates heaviest precipitation.')]},
  { code:'AES 3530', title:'Aerodynamics', credits:3, cat:'Technical', pre:'PHY 1250', inst:pick(1),
    desc:'Airfoil shapes, aerodynamic forces, performance, stability, control, and flight in sub/trans/supersonic envelopes.',
    ch:[{t:'Subsonic',l:[{t:'Airfoil Theory',c:'Pressure distribution, lift coefficient, drag.',d:55},{t:'Performance',c:'Climb, cruise, descent calculations.',d:50}]},{t:'High-Speed',l:[{t:'Transonic',c:'Critical Mach, shock waves, drag divergence.',d:50},{t:'Supersonic',c:'Mach regimes, expansion fans.',d:55}]},{t:'Stability',l:[{t:'Static Stability',c:'Longitudinal, lateral, directional.',d:45},{t:'Dynamic Stability',c:'Phugoid, short period, Dutch roll.',d:50}]}],
    quiz:[q('What is critical Mach number?',['Speed of sound','Speed where airflow first reaches Mach 1','Max structural speed','Stall speed'],1,'Free-stream Mach where airflow first reaches Mach 1.'),q('What opposes thrust in level flight?',['Lift','Weight','Drag','Side force'],2,'Drag opposes thrust.'),q('What is the phugoid mode?',['Yawing oscillation','Long-period pitch oscillation','Rolling motion','Spiral dive'],1,'Long-period oscillation exchanging speed and altitude.')]},
  { code:'AES 3550', title:'FAA Instructor Certification-Ground School', credits:4, cat:'Certification', pre:'AES 2130 or Commercial/Instrument', inst:pick(2),
    desc:'Prepares for FAA CFI knowledge exams. Advanced aeronautics, lesson plans, presentation, evaluation.',
    ch:[{t:'Fundamentals of Instruction',l:[{t:'Learning Theory',c:'How people learn, memory, motivation.',d:45},{t:'Teaching Methods',c:'Lecture, demonstration, scenario-based training.',d:50},{t:'Evaluation',c:'Assessment techniques, test development.',d:45}]}],
    quiz:[q('Most effective flight instruction method?',['Lecture only','Scenario-based training','Reading only','Memorization'],1,'Scenario-based training provides realistic context.'),q('Four levels of learning?',['See/hear/touch/taste','Rote/understanding/application/correlation','Read/write/speak/listen','Basic/intermediate/advanced/expert'],1,'Rote, understanding, application, correlation.'),q('How often must a CFI renew?',['Annually','Every 24 months','Every 36 months','Every 5 years'],1,'Every 24 calendar months.')]},
  { code:'AES 3600', title:'Space Flight Operations I', credits:3, cat:'Operations', pre:'Junior standing', inst:pick(4),
    desc:'History of space exploration, space vehicles, national policies, treaties, interplanetary travel, orbit prediction, launch/reentry.',
    ch:[{t:'Space History',l:[{t:'History of Spaceflight',c:'Sputnik, Mercury, ISS, commercial spaceflight.',d:50},{t:'Space Policy',c:'National policy, treaties, international cooperation.',d:45}]},{t:'Operations',l:[{t:'Launch Operations',c:'Launch vehicles, windows, ground ops.',d:50},{t:'Reentry',c:'Trajectories, thermal protection, landing.',d:45}]}],
    quiz:[q('First artificial satellite?',['Explorer 1','Sputnik 1','Vanguard 1','Telstar'],1,'Sputnik 1, October 4, 1957.'),q('What protects spacecraft during reentry?',['Solar panels','Heat shield','Parachutes only','Radar'],1,'Thermal protection system (heat shield).'),q('What orbit does the ISS occupy?',['Geostationary','Low Earth Orbit (~400 km)','Medium Earth','Polar'],1,'ISS orbits at ~400 km in LEO.')]},
  { code:'AES 3850', title:'Human Factors and Physiology of Flight', credits:3, cat:'Safety', pre:'Junior standing', inst:pick(2),
    desc:'Human factors, physiological effects of high- and low-altitude flight environments.',
    ch:[{t:'Physiology',l:[{t:'Hypoxia',c:'Types, time of useful consciousness, supplemental O2.',d:50},{t:'Spatial Disorientation',c:'Vestibular system, visual illusions.',d:50},{t:'G-Forces',c:'Positive and negative G effects.',d:45}]},{t:'Human Factors',l:[{t:'Fatigue and Stress',c:'Circadian rhythms, stress management.',d:45},{t:'CRM',c:'Communication, situational awareness, error management.',d:50}]}],
    quiz:[q('What is hypoxia?',['Excess oxygen','Deficiency of oxygen in tissues','High blood pressure','Dehydration'],1,'Deficiency of oxygen reaching body tissues.'),q('What are the leans?',['Climbing illusion','Spatial disorientation sensing false bank','Navigation error','Mechanical problem'],1,'Common spatial disorientation sensation.'),q('IMSAFE checklist used for?',['Aircraft inspection','Pilot self-assessment of fitness','Weather evaluation','Fuel calculation'],1,'Pre-flight pilot self-assessment.')]},
  { code:'AES 3870', title:'Aircraft Accident Investigation', credits:3, cat:'Safety', pre:'Junior standing', inst:pick(3),
    desc:'Investigation techniques, CVR/FDR analysis, human factors, report writing.',
    ch:[{t:'Investigation',l:[{t:'Framework',c:'NTSB process, go-team, party system.',d:50},{t:'Evidence',c:'Wreckage documentation, witnesses.',d:50}]},{t:'Analysis',l:[{t:'CVR and FDR',c:'Cockpit voice and flight data recorder examination.',d:50},{t:'HFACS',c:'Human Factors Analysis and Classification System.',d:45}]}],
    quiz:[q('Who leads US aircraft accident investigations?',['FAA','NTSB','FBI','TSA'],1,'NTSB leads accident investigations.'),q('What does FDR stand for?',['Federal Data Record','Flight Data Recorder','Fuel Distribution Report','Final Departure Record'],1,'Flight Data Recorder.'),q('What color are black boxes actually?',['Black','Bright orange','Red','Yellow'],1,'Bright orange for visibility in wreckage.')]},
  { code:'AES 3880', title:'Aviation Security', credits:3, cat:'Safety', pre:'Junior standing', inst:pick(4),
    desc:'Aviation security history, strategies, TSA, Transportation Security Regulations, airport and aircraft operator security.',
    ch:[{t:'Security Framework',l:[{t:'History',c:'Evolution from hijackings to post-9/11.',d:45},{t:'TSA',c:'Role, structure, key regulations.',d:50}]},{t:'Threats',l:[{t:'Threat Analysis',c:'Intelligence sharing, risk assessment.',d:50},{t:'Airport Security',c:'Screening, access control, perimeter security.',d:45}]}],
    quiz:[q('When was TSA created?',['1978','1995','2001 (after 9/11)','2010'],2,'Created by the 2001 Aviation and Transportation Security Act.'),q('What is a SIDA?',['Safety Inspection Area','Security Identification Display Area','Special Instrument Departure','Secure International Departure'],1,'Security Identification Display Area.')]},
  { code:'AES 4040', title:'Aircraft Performance', credits:3, cat:'Technical', pre:'AES 3530', inst:pick(6),
    desc:'Performance of Normal, Commuter, Transport aircraft. V-speeds, distances, and performance chart calculations.',
    ch:[{t:'Performance',l:[{t:'Takeoff',c:'Distances, V-speeds, field length.',d:50},{t:'Climb and Cruise',c:'Rate of climb, ceiling, optimization.',d:50}]},{t:'Landing',l:[{t:'Landing',c:'Approach speeds, distances, contaminated runway.',d:50},{t:'Limitations',c:'Density altitude, temperature, weight effects.',d:45}]}],
    quiz:[q('What is V1?',['Rotation speed','Takeoff decision speed','Best climb speed','Max flap speed'],1,'Maximum speed at which takeoff can be safely aborted.'),q('High density altitude effect?',['Improves performance','Degrades performance','No effect','Only affects fuel'],1,'Reduces air density, degrading performance.'),q('What is service ceiling?',['Max altitude','Altitude where climb = 100 FPM','Cruising altitude','Above clouds'],1,'Altitude where climb rate drops to 100 FPM.')]},
  { code:'AES 4200', title:'Airport Planning and Management I', credits:3, cat:'Operations', pre:'Junior standing', inst:pick(0),
    desc:'Airport planning, management, operations. Forecasting, revenue, FAA regulations, environmental impact, finance.',
    ch:[{t:'Planning',l:[{t:'Master Planning',c:'Components, forecasting, facility requirements.',d:50},{t:'Environmental',c:'Impact assessments, noise, zoning.',d:45}]},{t:'Management',l:[{t:'Revenue and Finance',c:'Rates, non-aero revenue, AIP grants.',d:50},{t:'Operations',c:'Part 139 certification, security.',d:45}]}],
    quiz:[q('What is AIP funding?',['Airline Investment','Airport Improvement Program grants','Aircraft Insurance','Air Industry Partnership'],1,'Airport Improvement Program federal grants.'),q('What FAA reg covers airport certification?',['Part 91','Part 121','Part 139','Part 135'],2,'Part 139 for airport certification.')]},
  { code:'AES 4370', title:'Advanced Navigation Systems', credits:3, cat:'Navigation', pre:'AES 2120', inst:pick(4),
    desc:'Geographic coordinates, route navigation, FMS, EFIS, INS, GPS in modern aviation.',
    ch:[{t:'Navigation Systems',l:[{t:'INS/IRS',c:'Inertial navigation, gyroscopes, accelerometers.',d:50},{t:'FMS',c:'Architecture, CDU, performance management.',d:55}]},{t:'Advanced GPS/EFIS',l:[{t:'Advanced GPS',c:'RAIM, augmentation, integrity monitoring.',d:50},{t:'EFIS',c:'Integrated displays, synthetic vision, TAWS.',d:45}]}],
    quiz:[q('What does INS stand for?',['Instrument Navigation Standard','Inertial Navigation System','Internal Navigation Software','Integrated Network System'],1,'Inertial Navigation System.'),q('What is RAIM?',['Radio Altitude Module','Receiver Autonomous Integrity Monitoring','Remote Aircraft Info','Radar and Instrument Monitoring'],1,'Receiver Autonomous Integrity Monitoring.')]},
  { code:'AES 4510', title:'Flight Instructor', credits:1, cat:'Certification', pre:'FAA Commercial/Instrument', inst:pick(6),
    desc:'FAA Certified Flight Instructor certificate. 15 hours flight training required.',
    ch:[{t:'CFI',l:[{t:'Instructor Training',c:'Teaching from right seat, demonstration, error correction.',d:50},{t:'CFI Checkride',c:'Oral exam and flight test preparation.',d:45}]}],
    quiz:[q('From which seat does a CFI teach?',['Left','Right','Back','Either'],1,'CFIs typically teach from the right seat.'),q('What must be obtained for credit?',['Written test','FAA CFI certificate','Solo time','Instrument check'],1,'FAA CFI certificate required.')]},
  { code:'AES 4570', title:'Airline Transport Pilot', credits:1, cat:'Certification', pre:'FAA Commercial/Instrument', inst:pick(2),
    desc:'Requires 1,500 hours flight time. Navigation, weather, FARs, communications, weight distribution, loading.',
    ch:[{t:'ATP',l:[{t:'Knowledge Areas',c:'Advanced regulations, weather, performance.',d:55},{t:'Practical Test',c:'CTP course, oral, checkride.',d:50}]}],
    quiz:[q('Total flight hours for ATP?',['500','1,000','1,500','2,000'],2,'1,500 hours required.'),q('Minimum age for ATP?',['18','21','23','25'],2,'Minimum 23 years old.')]},
  { code:'AES 4860', title:'Aviation Safety', credits:3, cat:'Safety', pre:'Junior standing', inst:pick(3),
    desc:'Modern aviation safety: regulations, NTSB, statistics, human factors, SMS, risk management.',
    ch:[{t:'Safety Frameworks',l:[{t:'Regulations and NTSB',c:'Regulatory framework and NTSB role.',d:50},{t:'SMS',c:'Components, hazard ID, risk assessment.',d:55}]},{t:'Analysis',l:[{t:'TEM',c:'Threat and error management, LOSA.',d:50},{t:'Safety Data',c:'Accident rates, trends, safety indicators.',d:45}]}],
    quiz:[q('Four SMS pillars?',['Policy/Risk/Assurance/Promotion','Plan/Execute/Monitor/Close','Identify/Assess/Mitigate/Accept','Prevent/Detect/Respond/Recover'],0,'Safety Policy, Risk Mgmt, Assurance, Promotion.'),q('What is TEM?',['Eliminating all threats','Framework for managing threats/errors/undesired states','Insurance','Maintenance protocol'],1,'Threat and Error Management framework.')]},
  { code:'AES 4910', title:'Aviation and Aerospace Strategic Planning', credits:3, cat:'General', pre:'Junior standing, Aviation major', inst:pick(5),
    desc:'Capstone course: strategic planning, critical thinking, professional development, career portfolio.',
    ch:[{t:'Strategy',l:[{t:'Industry Analysis',c:'SWOT, PESTEL, competitive analysis.',d:50},{t:'Decision Making',c:'Scenario analysis, organizational strategy.',d:50}]},{t:'Professional',l:[{t:'Career Planning',c:'Portfolio creation, networking.',d:45},{t:'Capstone Presentation',c:'Final strategic plan presentation.',d:50}]}],
    quiz:[q('What is SWOT?',['Safety/Weather/Ops/Tech','Strengths/Weaknesses/Opportunities/Threats','Systems/Workforce/Output/Training','Strategy/Workforce/Org/Timing'],1,'Strengths, Weaknesses, Opportunities, Threats.'),q('What makes a capstone course?',['First course','Integrates knowledge from entire program','Optional','Single topic'],1,'Integrates and applies knowledge from the entire program.')]},
  { code:'AES 4935', title:'Advanced Commercial Aircraft Systems', credits:4, cat:'Technical', pre:'Senior, AES 3000, Commercial/Instrument', inst:pick(7),
    desc:'Modern air carrier aircraft systems: powerplant, fuel, electrical, hydraulic, avionics, flight controls, fire/ice protection. Normal and emergency procedures.',
    ch:[{t:'Transport Systems',l:[{t:'Powerplant and Fuel',c:'Turbofan operation, fuel management, APU.',d:55},{t:'Electrical and Hydraulic',c:'Multi-bus electrical, triple-redundant hydraulics.',d:55}]},{t:'Safety Systems',l:[{t:'Fire and Ice Protection',c:'Fire detection/suppression, anti-ice/de-ice.',d:50},{t:'Flight Controls and Avionics',c:'Fly-by-wire, TCAS, EGPWS, weather radar.',d:55}]}],
    quiz:[q('What is an APU?',['Aircraft Position Unit','Auxiliary Power Unit','Automatic Pilot Update','Air Pressure Unit'],1,'Auxiliary Power Unit for ground power and bleed air.'),q('What does TCAS do?',['Controls throttles','Provides traffic alerts to prevent midair collisions','Manages fuel','Controls gear'],1,'Traffic Collision Avoidance System.'),q('What is fly-by-wire?',['Near power lines','Electronic flight control replacing mechanical linkages','Wire-guided missiles','Communication cables'],1,'Electronic signals replace mechanical control linkages.')]},
]

async function seed() {
  console.log(`Seeding ${COURSES.length} AES courses...`)
  let ok = 0, err = 0

  for (let i = 0; i < COURSES.length; i++) {
    const c = COURSES[i]
    const chapCount = c.ch.length
    const lessCount = c.ch.reduce((s, ch) => s + ch.l.length, 0)
    process.stdout.write(`[${i+1}/${COURSES.length}] ${c.code}...`)

    try {
      const { data: course, error: cErr } = await supabase.from('courses').insert({
        title: `${c.code} - ${c.title}`, description: c.desc, instructor: c.inst,
        category: c.cat, published: true, chapters_count: chapCount,
        lessons_count: lessCount, enrolled_count: Math.floor(Math.random() * 40) + 5,
      }).select().single()
      if (cErr) throw cErr

      let sort = 0
      for (const ch of c.ch) {
        const { data: chData } = await supabase.from('course_content').insert({
          course_id: course.id, title: ch.t, type: 'chapter', sort_order: sort++, duration_minutes: 0,
        }).select().single()

        for (const ls of ch.l) {
          await supabase.from('course_content').insert({
            course_id: course.id, title: ls.t, type: 'lesson', content: ls.c,
            parent_id: chData?.id, sort_order: sort++, duration_minutes: ls.d,
          })
        }
      }

      const { data: quiz } = await supabase.from('quizzes').insert({
        title: `${c.code} - ${c.title} Assessment`, course_id: course.id,
        course_title: `${c.code} - ${c.title}`, questions_count: c.quiz.length,
        passing_score: 70, avg_score: 0, attempts: 0,
      }).select().single()

      if (quiz) {
        for (let qi = 0; qi < c.quiz.length; qi++) {
          const qq = c.quiz[qi]
          await supabase.from('quiz_questions').insert({
            quiz_id: quiz.id, question_text: qq.question, options: qq.options,
            correct_answer: qq.correct, explanation: qq.explanation, sort_order: qi,
          })
        }
      }

      console.log(` OK (${chapCount}ch, ${lessCount}ls, ${c.quiz.length}q)`)
      ok++
    } catch (e) {
      console.log(` FAIL: ${e.message}`)
      err++
    }
  }

  console.log(`\nDone! ${ok} created, ${err} errors.`)
}
seed()
