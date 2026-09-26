CREATE TABLE normalized_skills (
  canonical_id text PRIMARY KEY,
  canonical_name text NOT NULL UNIQUE,
  domains text[] NOT NULL DEFAULT '{}',
  skill_type text NOT NULL CHECK(skill_type IN ('FOUNDATION','LANGUAGE','FRAMEWORK','TECHNOLOGY','PLATFORM','PRACTICE','CONCEPT')),
  related text[] NOT NULL DEFAULT '{}'
);
CREATE TABLE normalized_skill_aliases (
  normalized_alias text PRIMARY KEY CHECK(normalized_alias=lower(btrim(normalized_alias))),
  canonical_id text NOT NULL REFERENCES normalized_skills(canonical_id) ON DELETE CASCADE
);
INSERT INTO normalized_skills VALUES
('javascript','JavaScript',ARRAY['frontend','backend','fullstack'],'LANGUAGE',ARRAY['typescript','nodejs','react']),
('typescript','TypeScript',ARRAY['frontend','backend','fullstack'],'LANGUAGE',ARRAY['javascript']),
('react','React',ARRAY['frontend','fullstack'],'FRAMEWORK',ARRAY['javascript','typescript']),
('nodejs','Node.js',ARRAY['backend','fullstack'],'PLATFORM',ARRAY['javascript','typescript']),
('postgresql','PostgreSQL',ARRAY['backend','fullstack'],'TECHNOLOGY',ARRAY['sql','transactions','indexing']),
('docker','Docker',ARRAY['backend','cloud-devops'],'PLATFORM',ARRAY['containers','deployment']),
('kubernetes','Kubernetes',ARRAY['cloud-devops'],'PLATFORM',ARRAY['containers','deployment']),
('generative-ai','Generative AI',ARRAY['ai-application'],'CONCEPT',ARRAY['llm','prompting','rag']),
('rest-apis','REST APIs',ARRAY['frontend','backend','fullstack','ai-application'],'PRACTICE',ARRAY['http','api-design']),
('amazon-ec2','Amazon EC2',ARRAY['cloud-devops'],'PLATFORM',ARRAY['aws','compute']);
INSERT INTO normalized_skill_aliases VALUES
('js','javascript'),('javascript','javascript'),('react','react'),('react.js','react'),('reactjs','react'),('react js','react'),
('ts','typescript'),('typescript','typescript'),('node','nodejs'),('node.js','nodejs'),('nodejs','nodejs'),
('postgres','postgresql'),('postgresql','postgresql'),('postgre sql','postgresql'),('docker','docker'),
('k8s','kubernetes'),('kubernetes','kubernetes'),('gen ai','generative-ai'),('generative ai','generative-ai'),
('rest api','rest-apis'),('rest apis','rest-apis'),('aws ec2','amazon-ec2'),('amazon ec2','amazon-ec2'),('ec2','amazon-ec2');

ALTER TABLE paid_setup_contexts ADD COLUMN target_path text CHECK(target_path IS NULL OR target_path IN
  ('FRONTEND_ENGINEER','BACKEND_ENGINEER','FULL_STACK_ENGINEER','AI_APPLICATION_ENGINEER','CLOUD_DEVOPS_ENGINEER'));
ALTER TABLE paid_setup_contexts ADD COLUMN reasoning_provider text;
ALTER TABLE paid_setup_contexts ADD COLUMN reasoning_model text;
ALTER TABLE paid_setup_contexts ADD COLUMN proposal_response_id text;
ALTER TABLE capabilities DROP CONSTRAINT capabilities_tab_check;
ALTER TABLE capabilities ADD CONSTRAINT capabilities_tab_nonempty CHECK(btrim(tab)<>'');
ALTER TABLE capabilities ADD COLUMN learner_id uuid REFERENCES learners(learner_id);
ALTER TABLE capabilities ADD COLUMN origin text NOT NULL DEFAULT 'LEGACY_SEED' CHECK(origin IN ('LEGACY_SEED','AI_GENERATED'));
ALTER TABLE capabilities ADD COLUMN external_key text;
ALTER TABLE concepts ADD COLUMN origin text NOT NULL DEFAULT 'LEGACY_SEED' CHECK(origin IN ('LEGACY_SEED','AI_GENERATED'));
ALTER TABLE concepts ADD COLUMN external_key text;
ALTER TABLE concepts ADD COLUMN recommendation_reason text;
ALTER TABLE generation_runs ADD COLUMN provider text;
ALTER TABLE generation_runs ADD COLUMN model text;
ALTER TABLE generation_runs ADD COLUMN response_id text;
CREATE INDEX capabilities_by_learner ON capabilities(learner_id,position);
CREATE UNIQUE INDEX ai_capability_key_by_learner ON capabilities(learner_id,external_key) WHERE origin='AI_GENERATED';

COMMENT ON TABLE normalized_skills IS 'Terminology normalization only. It must not determine curriculum, recommendations, depth, or ordering.';
COMMENT ON TABLE capabilities IS 'AI-generated learner capabilities are persisted here; legacy seed rows are not used by the dynamic reasoning service.';
