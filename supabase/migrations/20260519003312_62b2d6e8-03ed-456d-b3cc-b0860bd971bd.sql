
CREATE TYPE public.supporting_doc_type AS ENUM ('job_description', 'certificate', 'other');

CREATE TABLE public.supporting_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  application_id UUID NOT NULL,
  doc_type public.supporting_doc_type NOT NULL,
  file_path TEXT NOT NULL,
  original_name TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.supporting_documents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "owners view supporting" ON public.supporting_documents
  FOR SELECT USING (owns_application(application_id) OR has_role(auth.uid(),'evaluator') OR has_role(auth.uid(),'admin'));

CREATE POLICY "owners insert supporting" ON public.supporting_documents
  FOR INSERT WITH CHECK (owns_application(application_id));

CREATE POLICY "owners delete supporting" ON public.supporting_documents
  FOR DELETE USING (owns_application(application_id));

CREATE POLICY "staff manage supporting" ON public.supporting_documents
  FOR ALL USING (has_role(auth.uid(),'evaluator') OR has_role(auth.uid(),'admin'))
  WITH CHECK (has_role(auth.uid(),'evaluator') OR has_role(auth.uid(),'admin'));

INSERT INTO storage.buckets (id, name, public) VALUES ('supporting-documents','supporting-documents', false);

CREATE POLICY "owners read own supporting files" ON storage.objects
  FOR SELECT USING (
    bucket_id = 'supporting-documents'
    AND (auth.uid()::text = (storage.foldername(name))[1]
         OR has_role(auth.uid(),'evaluator')
         OR has_role(auth.uid(),'admin'))
  );

CREATE POLICY "owners upload supporting files" ON storage.objects
  FOR INSERT WITH CHECK (
    bucket_id = 'supporting-documents'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

CREATE POLICY "owners delete supporting files" ON storage.objects
  FOR DELETE USING (
    bucket_id = 'supporting-documents'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );
