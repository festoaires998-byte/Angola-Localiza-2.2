import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

const legacyBucket = "field-photos";
const targetBucket = "delivery-proofs";

Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response("Method Not Allowed", { status: 405 });

  const auth = req.headers.get("authorization") ?? "";
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  if (!serviceKey || auth !== `Bearer ${serviceKey}`) {
    return new Response("Unauthorized", { status: 401 });
  }

  const { data: proofs, error } = await supabase
    .from("delivery_proofs")
    .select("id,created_by,photo_url,signature_url")
    .or("photo_url.like.%/storage/v1/object/public/field-photos/%,signature_url.like.%/storage/v1/object/public/field-photos/%");

  if (error) return Response.json({ error: error.message }, { status: 500 });

  const results = [];
  for (const proof of proofs ?? []) {
    const urls: Array<["photo_url" | "signature_url", string]> = [];
    if (proof.photo_url?.includes("/storage/v1/object/public/field-photos/")) urls.push(["photo_url", proof.photo_url]);
    if (proof.signature_url?.includes("/storage/v1/object/public/field-photos/")) urls.push(["signature_url", proof.signature_url]);

    const updates: Record<string, string> = {};
    for (const [column, url] of urls) {
      const marker = "/storage/v1/object/public/field-photos/";
      const sourcePath = decodeURIComponent(url.split(marker)[1] ?? "");
      if (!sourcePath) continue;

      const targetPath = `${proof.created_by}/legacy-${sourcePath}`;
      const { data: file } = await supabase.storage.from(legacyBucket).download(sourcePath);
      if (!file) {
        results.push({ proof_id: proof.id, column, status: "source_missing", sourcePath });
        continue;
      }

      const { error: uploadError } = await supabase.storage.from(targetBucket).upload(targetPath, file, { upsert: false });
      if (uploadError && !uploadError.message.toLowerCase().includes("already exists")) {
        results.push({ proof_id: proof.id, column, status: "copy_failed", error: uploadError.message });
        continue;
      }

      updates[column] = targetPath;
      results.push({ proof_id: proof.id, column, status: "copied", targetPath });
    }

    if (Object.keys(updates).length) {
      const { error: updateError } = await supabase.from("delivery_proofs").update(updates).eq("id", proof.id);
      if (updateError) results.push({ proof_id: proof.id, status: "db_update_failed", error: updateError.message });
    }
  }

  return Response.json({ migrated: results });
});
