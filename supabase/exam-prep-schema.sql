-- ╔══════════════════════════════════════════════════════════╗
-- ║  AeroBridge – Exam Prep Schema                         ║
-- ║  FAA · ICAO · EASA knowledge-test preparation          ║
-- ╚══════════════════════════════════════════════════════════╝

-- Exam categories (e.g. Private Pilot, Instrument Rating, ICAO ELP)
create table if not exists exam_categories (
  id            uuid primary key default gen_random_uuid(),
  authority     text not null check (authority in ('FAA','ICAO','EASA')),
  code          text not null unique,
  name          text not null,
  description   text not null default '',
  question_count int not null default 0,
  time_limit_minutes int not null default 60,
  passing_score int not null default 70,
  icon          text not null default 'BookOpen',
  color         text not null default 'blue',
  topics        jsonb not null default '[]',
  difficulty    text not null default 'intermediate'
                  check (difficulty in ('beginner','intermediate','advanced','expert')),
  sort_order    int not null default 0,
  published     boolean not null default true,
  created_at    timestamptz not null default now()
);

-- Individual exam questions
create table if not exists exam_questions (
  id            uuid primary key default gen_random_uuid(),
  category_id   uuid not null references exam_categories(id) on delete cascade,
  topic_id      text,
  question_text text not null,
  options       jsonb not null default '[]',
  correct_answer int not null default 0,
  explanation   text not null default '',
  reference     text,
  difficulty    text not null default 'medium'
                  check (difficulty in ('easy','medium','hard')),
  sort_order    int not null default 0,
  created_at    timestamptz not null default now()
);

-- User exam attempts
create table if not exists exam_attempts (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null,
  category_id     uuid not null references exam_categories(id) on delete cascade,
  score           int not null default 0,
  total_questions int not null default 0,
  correct_answers int not null default 0,
  passed          boolean not null default false,
  time_spent_seconds int not null default 0,
  answers         jsonb not null default '{}',
  started_at      timestamptz not null default now(),
  completed_at    timestamptz
);

create index if not exists idx_exam_questions_category on exam_questions(category_id);
create index if not exists idx_exam_attempts_user     on exam_attempts(user_id);
create index if not exists idx_exam_attempts_cat      on exam_attempts(category_id);

-- View: per-user progress summary
create or replace view exam_progress as
select
  a.user_id,
  a.category_id,
  c.name        as category_name,
  c.authority,
  count(*)      as attempts,
  max(a.score)  as best_score,
  (array_agg(a.score order by a.completed_at desc))[1] as last_score,
  max(a.completed_at) as last_attempt_at,
  bool_or(a.passed) as passed
from exam_attempts a
join exam_categories c on c.id = a.category_id
where a.completed_at is not null
group by a.user_id, a.category_id, c.name, c.authority;

-- RLS
alter table exam_categories enable row level security;
alter table exam_questions   enable row level security;
alter table exam_attempts    enable row level security;

create policy "Anyone can read published categories"
  on exam_categories for select using (published = true);

create policy "Anyone can read questions"
  on exam_questions for select using (true);

create policy "Users see own attempts"
  on exam_attempts for select using (auth.uid() = user_id);

create policy "Users can insert own attempts"
  on exam_attempts for insert with check (auth.uid() = user_id);

-- ═══════════════════════════════════════════════════════════
-- SEED: FAA Exam Categories
-- ═══════════════════════════════════════════════════════════

insert into exam_categories (authority, code, name, description, question_count, time_limit_minutes, passing_score, icon, color, difficulty, sort_order, topics) values

('FAA', 'FAA-PAR', 'Private Pilot (PAR)',
 'FAA Private Pilot – Airplane knowledge test. Covers aerodynamics, regulations, weather, navigation, performance, and flight operations per ACS FAA-S-ACS-6C.',
 60, 150, 70, 'Plane', 'blue', 'beginner', 1,
 '[
   {"id":"par-regs","code":"PA.I","name":"Regulations","description":"14 CFR Part 61 & 91: pilot privileges, limitations, currency, airspace rules, ATC light signals, documents & maintenance.","question_count":10},
   {"id":"par-aero","code":"PA.II","name":"Aerodynamics","description":"Principles of flight: lift, drag, thrust, weight; load factor, stalls, spins, ground effect, P-factor and adverse yaw.","question_count":8},
   {"id":"par-wx","code":"PA.III","name":"Weather","description":"VFR weather minimums, METARs, TAFs, AIRMETs/SIGMETs, fronts, cloud types, icing, thunderstorm hazards and density altitude.","question_count":12},
   {"id":"par-nav","code":"PA.IV","name":"Navigation","description":"Sectional charts, pilotage, dead reckoning, VOR/GPS navigation, magnetic compass errors, and cross-country planning.","question_count":10},
   {"id":"par-perf","code":"PA.V","name":"Performance & W/B","description":"Weight & balance calculations, takeoff/landing performance charts, density altitude effects, and aircraft limitations.","question_count":8},
   {"id":"par-ops","code":"PA.VI","name":"Flight Operations","description":"Airport operations, traffic patterns, radio communications, collision avoidance, night flying, and ADM/CRM.","question_count":7},
   {"id":"par-inst","code":"PA.VII","name":"Flight Instruments","description":"Pitot-static system, gyroscopic instruments, magnetic compass, glass-cockpit basics, and instrument errors.","question_count":5}
 ]'),

('FAA', 'FAA-IRA', 'Instrument Rating (IRA)',
 'FAA Instrument Rating – Airplane knowledge test. Covers IFR regulations, departure/approach procedures, ATC clearances, weather, and navigation per ACS FAA-S-ACS-8C.',
 60, 150, 70, 'Gauge', 'indigo', 'intermediate', 2,
 '[
   {"id":"ira-regs","code":"IR.I","name":"IFR Regulations","description":"14 CFR Parts 91 & 97: IFR requirements, currency, minimums, alternate airport requirements, MEA/MOCA.","question_count":10},
   {"id":"ira-dep","code":"IR.II","name":"Departure Procedures","description":"ODPs, SIDs, obstacle clearance, diverse departures, and IFR departure planning.","question_count":7},
   {"id":"ira-enr","code":"IR.III","name":"En Route Operations","description":"Victor & jet airways, IFR altitudes, RNAV routes, holding procedures, EFC times, and lost-comm rules.","question_count":8},
   {"id":"ira-app","code":"IR.IV","name":"Approach Procedures","description":"ILS, VOR, GPS, RNAV approaches, minimums (DA/MDA), missed approach procedures, and circling approaches.","question_count":12},
   {"id":"ira-wx","code":"IR.V","name":"IFR Weather","description":"PIREPs, icing levels, turbulence, windshear, convective SIGMETs, prog charts, and radar interpretation.","question_count":10},
   {"id":"ira-nav","code":"IR.VI","name":"Navigation Systems","description":"VOR/DME, ILS components, GPS/WAAS, RAIM, ADF/NDB, FMS, and RNAV equipment requirements.","question_count":8},
   {"id":"ira-adm","code":"IR.VII","name":"ADM & Human Factors","description":"Aeronautical decision-making under IFR, spatial disorientation, vestibular illusions, and CRM.","question_count":5}
 ]'),

('FAA', 'FAA-CAX', 'Commercial Pilot (CAX)',
 'FAA Commercial Pilot – Airplane knowledge test. Deeper performance planning, complex systems, night operations, and commercial regulations per ACS FAA-S-ACS-7B.',
 100, 180, 70, 'Briefcase', 'emerald', 'advanced', 3,
 '[
   {"id":"cax-regs","code":"CP.I","name":"Commercial Regulations","description":"14 CFR Parts 61, 91, 119, 135: commercial privileges, operating limitations, carriage of passengers/cargo for hire.","question_count":15},
   {"id":"cax-perf","code":"CP.II","name":"Advanced Performance","description":"Complex performance charts, accelerate-stop distance, climb gradients, fuel planning, high-altitude ops.","question_count":18},
   {"id":"cax-sys","code":"CP.III","name":"Aircraft Systems","description":"Retractable gear, constant-speed propellers, fuel injection, pressurization, turbocharging, de-ice/anti-ice.","question_count":12},
   {"id":"cax-aero","code":"CP.IV","name":"Advanced Aerodynamics","description":"Mach number, swept-wing effects, high-altitude aerodynamics, Vmca, critical engine, multi-engine principles.","question_count":12},
   {"id":"cax-wx","code":"CP.V","name":"Weather Theory","description":"Stability analysis, jet stream, microbursts, mountain wave, icing certifications, and weather radar usage.","question_count":15},
   {"id":"cax-nav","code":"CP.VI","name":"Navigation & Planning","description":"International flight planning, ICAO flight plan, ETOPS awareness, RVSM, performance-based navigation.","question_count":13},
   {"id":"cax-ops","code":"CP.VII","name":"Flight Operations","description":"Night operations, emergency procedures, high-performance maneuvers, ADM, resource management.","question_count":8},
   {"id":"cax-hf","code":"CP.VIII","name":"Human Factors","description":"Fatigue management, hypoxia, stress, workload management, and crew resource management.","question_count":7}
 ]'),

('FAA', 'FAA-ATP', 'Airline Transport Pilot (ATP)',
 'FAA ATP knowledge test. The highest level of pilot certification covering transport-category operations, meteorology, human factors, and regulations per ACS FAA-S-ACS-11A.',
 80, 240, 70, 'Building2', 'violet', 'expert', 4,
 '[
   {"id":"atp-regs","code":"AT.I","name":"ATP Regulations","description":"14 CFR Parts 91, 121, 135: airline operations, duty/rest rules, dispatch requirements, MEL/CDL, SOPs.","question_count":15},
   {"id":"atp-met","code":"AT.II","name":"Advanced Meteorology","description":"Upper-air charts, constant-pressure analysis, jet stream positioning, volcanic ash, and SIGWX charts.","question_count":15},
   {"id":"atp-perf","code":"AT.III","name":"Transport Performance","description":"V-speeds for transport aircraft, WAT limits, runway analysis, contaminated runway performance, ETOPS.","question_count":15},
   {"id":"atp-sys","code":"AT.IV","name":"Transport Systems","description":"FMS/MCDU, autoflight modes, TCAS, EGPWS, hydraulic/pneumatic systems, glass-cockpit CAS messages.","question_count":10},
   {"id":"atp-hf","code":"AT.V","name":"Human Factors & CRM","description":"TEM, automation complacency, fatigue risk management, LOSA, sterile cockpit rule, communication models.","question_count":10},
   {"id":"atp-nav","code":"AT.VI","name":"Advanced Navigation","description":"RNAV/RNP operations, PBN, GBAS/SBAS, oceanic procedures, MNPS, NAT HLA, CPDLC, datalink.","question_count":10},
   {"id":"atp-ops","code":"AT.VII","name":"Line Operations","description":"CATII/III approaches, low-visibility ops, rejected takeoff criteria, emergency/abnormal procedures.","question_count":5}
 ]'),

('FAA', 'FAA-107', 'Remote Pilot (Part 107)',
 'FAA Part 107 Small UAS Remote Pilot knowledge test. Required to fly drones commercially in the US. 60 questions covering airspace, weather, regulations, and operations.',
 60, 120, 70, 'Radio', 'amber', 'beginner', 5,
 '[
   {"id":"107-regs","code":"UP.I","name":"UAS Regulations","description":"Part 107 rules: registration, operating limitations, waivers, pilot certification, and accident reporting.","question_count":12},
   {"id":"107-airspace","code":"UP.II","name":"Airspace & Charts","description":"Airspace classification, controlled/uncontrolled airspace, TFRs, NOTAMs, sectional chart reading for UAS.","question_count":12},
   {"id":"107-wx","code":"UP.III","name":"Aviation Weather","description":"METAR/TAF reading, density altitude effects on UAS, wind & turbulence, visibility, and weather sources.","question_count":10},
   {"id":"107-ops","code":"UP.IV","name":"UAS Operations","description":"Preflight inspection, loading & CG, emergency procedures, crew coordination, and maintenance.","question_count":10},
   {"id":"107-perf","code":"UP.V","name":"Performance & ADM","description":"Battery management, payload effects, aeronautical decision-making, and risk assessment.","question_count":8},
   {"id":"107-airport","code":"UP.VI","name":"Airport Operations","description":"Airport markings, lighting, traffic patterns, radio communication, and right-of-way rules.","question_count":8}
 ]'),

-- ═══════════════════════════════════════════════════════════
-- SEED: ICAO/EASA Exam Categories
-- ═══════════════════════════════════════════════════════════

('ICAO', 'ICAO-ELP', 'English Language Proficiency (ELP)',
 'ICAO Language Proficiency test per Doc 9835. Mandatory for international operations. Assesses six skills: pronunciation, structure, vocabulary, fluency, comprehension, and interactions.',
 40, 90, 70, 'Languages', 'sky', 'intermediate', 10,
 '[
   {"id":"elp-pron","code":"ELP.1","name":"Pronunciation","description":"Intelligibility of speech, accent impact, stress/intonation patterns in aviation radiotelephony.","question_count":6},
   {"id":"elp-struct","code":"ELP.2","name":"Structure","description":"Grammar accuracy: tenses, conditionals, passive voice, question forms used in ATC communication.","question_count":7},
   {"id":"elp-vocab","code":"ELP.3","name":"Vocabulary","description":"ICAO standard phraseology, plain-language vocabulary for normal, abnormal, and emergency situations.","question_count":8},
   {"id":"elp-flu","code":"ELP.4","name":"Fluency","description":"Pace of speech, hesitation management, self-correction ability, and natural conversation flow.","question_count":6},
   {"id":"elp-comp","code":"ELP.5","name":"Comprehension","description":"Understanding pilot/ATC communications, readbacks, non-routine messages, and accented speech.","question_count":7},
   {"id":"elp-inter","code":"ELP.6","name":"Interactions","description":"Initiating/maintaining exchanges, clarification strategies, managing misunderstandings.","question_count":6}
 ]'),

('ICAO', 'ICAO-010', 'Air Law (010)',
 'ICAO ATPL theory – Air Law. Covers ICAO annexes, Chicago Convention, rules of the air, ATC procedures, aerodrome operations, search & rescue, and aircraft investigation.',
 80, 120, 75, 'Scale', 'slate', 'advanced', 11,
 '[
   {"id":"010-icao","code":"010.1","name":"ICAO & the Chicago Convention","description":"Structure of ICAO, annexes 1-19, SARPs, differences filing, sovereignty, and freedoms of the air.","question_count":15},
   {"id":"010-rules","code":"010.2","name":"Rules of the Air","description":"Annex 2: general rules, VFR/IFR rules, right-of-way, signals, and interception procedures.","question_count":15},
   {"id":"010-atc","code":"010.3","name":"ATC Procedures","description":"Annex 11: ATS provision, flight plans, separation standards, wake turbulence categories.","question_count":15},
   {"id":"010-aero","code":"010.4","name":"Aerodromes","description":"Annex 14: reference codes, runway markings, lighting systems, obstacle clearance surfaces.","question_count":12},
   {"id":"010-sar","code":"010.5","name":"Search & Rescue","description":"Annex 12: SAR organization, ELT requirements, distress & urgency procedures.","question_count":8},
   {"id":"010-inv","code":"010.6","name":"Accident Investigation","description":"Annex 13: definitions, notification, investigation authority, safety recommendations.","question_count":8},
   {"id":"010-lic","code":"010.7","name":"Personnel Licensing","description":"Annex 1: licence types, ratings, medical requirements, and validity periods.","question_count":7}
 ]'),

('ICAO', 'ICAO-050', 'Meteorology (050)',
 'ICAO ATPL theory – Meteorology. Comprehensive weather science including atmosphere physics, synoptic analysis, tropical meteorology, jet streams, and aviation hazards.',
 80, 120, 75, 'CloudSun', 'cyan', 'advanced', 12,
 '[
   {"id":"050-atm","code":"050.1","name":"The Atmosphere","description":"Composition, ICAO standard atmosphere, layers, temperature lapse rates, tropopause.","question_count":10},
   {"id":"050-wind","code":"050.2","name":"Wind","description":"Pressure gradient force, Coriolis, geostrophic/gradient wind, local winds, jet streams.","question_count":12},
   {"id":"050-cloud","code":"050.3","name":"Clouds & Precipitation","description":"Cloud classification, formation processes, icing, rain/snow/hail, adiabatic processes.","question_count":12},
   {"id":"050-vis","code":"050.4","name":"Visibility & Fog","description":"Radiation/advection fog, mist, haze, precipitation effects, RVR measurement.","question_count":8},
   {"id":"050-front","code":"050.5","name":"Air Masses & Fronts","description":"Air mass classification, warm/cold/occluded fronts, frontal weather, and polar front theory.","question_count":12},
   {"id":"050-haz","code":"050.6","name":"Aviation Hazards","description":"Thunderstorms, microbursts, windshear, mountain waves, CAT, volcanic ash, and icing levels.","question_count":14},
   {"id":"050-chart","code":"050.7","name":"Weather Charts & Reports","description":"METAR, TAF, SIGMET, SIGWX charts, upper-wind charts, and satellite imagery interpretation.","question_count":12}
 ]'),

('ICAO', 'ICAO-040', 'Human Performance (040)',
 'ICAO ATPL theory – Human Performance & Limitations. Physiology, psychology, CRM, threat/error management, fatigue, and human factors in aviation.',
 60, 90, 75, 'Brain', 'rose', 'intermediate', 13,
 '[
   {"id":"040-phys","code":"040.1","name":"Aviation Physiology","description":"Hypoxia, hyperventilation, acceleration effects, decompression sickness, barotrauma, vision limitations.","question_count":12},
   {"id":"040-psych","code":"040.2","name":"Psychology & Cognition","description":"Information processing, attention, perception, memory, decision-making biases, and stress.","question_count":10},
   {"id":"040-fatigue","code":"040.3","name":"Fatigue & Sleep","description":"Circadian rhythms, sleep stages, jet lag, fatigue risk management systems (FRMS).","question_count":10},
   {"id":"040-crm","code":"040.4","name":"CRM & Communication","description":"Crew coordination models, authority gradient, assertiveness, situational awareness, and briefings.","question_count":10},
   {"id":"040-tem","code":"040.5","name":"Threat & Error Management","description":"TEM framework, error types, error trapping, undesired aircraft states, and LOSA.","question_count":8},
   {"id":"040-auto","code":"040.6","name":"Automation & Workload","description":"Automation levels, complacency, mode confusion, workload management, and startle effect.","question_count":10}
 ]'),

('ICAO', 'ICAO-061', 'General Navigation (061)',
 'ICAO ATPL theory – General Navigation. Earth geometry, chart projections, dead reckoning, map reading, solar system effects, and compasses.',
 60, 120, 75, 'Compass', 'teal', 'advanced', 14,
 '[
   {"id":"061-earth","code":"061.1","name":"Earth & Coordinates","description":"Great circles, rhumb lines, latitude/longitude, convergence, and departure calculations.","question_count":10},
   {"id":"061-chart","code":"061.2","name":"Chart Projections","description":"Lambert conformal, Mercator, polar stereographic, chart properties, scale, and relief depiction.","question_count":10},
   {"id":"061-dr","code":"061.3","name":"Dead Reckoning","description":"Triangle of velocities, wind components, heading/track calculations, groundspeed, and ETA.","question_count":12},
   {"id":"061-comp","code":"061.4","name":"Compasses","description":"Direct-reading/remote-reading compasses, deviation, variation, dip, and turning/acceleration errors.","question_count":10},
   {"id":"061-solar","code":"061.5","name":"Solar System & Time","description":"Seasons, apparent/mean sun, UTC/LMT conversion, sunrise/sunset, and twilight.","question_count":8},
   {"id":"061-map","code":"061.6","name":"Map Reading","description":"Symbol identification, terrain interpretation, position plotting, and map orientation.","question_count":10}
 ]')

on conflict (code) do nothing;
