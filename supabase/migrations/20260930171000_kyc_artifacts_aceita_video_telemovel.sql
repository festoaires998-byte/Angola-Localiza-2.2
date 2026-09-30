-- O vídeo da verificação de identidade gravado no telemóvel (app) é mp4 (Android)
-- ou mov (iPhone); o bucket só aceitava o webm do navegador (site).
update storage.buckets
   set allowed_mime_types = array['image/jpeg','image/png','video/webm','video/mp4','video/quicktime']
 where id = 'kyc-artifacts';
