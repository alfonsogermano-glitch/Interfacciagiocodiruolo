"""Build a private, selective native-image recovery bundle. No network/DB writes."""
from pathlib import Path
import base64
import hashlib
import io
import json
import shutil
import sys
import tarfile
import uuid

ROOT = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(ROOT / ".local/image-tools"))
from PIL import Image, ImageOps

def q(value):
    return "'" + str(value).replace("'", "''") + "'"

def js(value):
    return q(json.dumps(value, separators=(",", ":"), ensure_ascii=True)) + "::jsonb"

def legacy_user(value):
    try:
        return str(uuid.UUID(value))
    except ValueError:
        b = bytearray(hashlib.sha256(("hollowgate:legacy-user:" + value).encode()).digest()[:16])
        b[6] = (b[6] & 15) | 80
        b[8] = (b[8] & 63) | 128
        return str(uuid.UUID(bytes=bytes(b)))

def build():
    private = ROOT / "deploy/aruba/data"
    data = json.loads((private / "supabase-export.json").read_text(encoding="utf-8"))
    manifest = json.loads((private / "legacy-public-media/manifest.json").read_text(encoding="utf-8"))
    media = {item["sourceUrl"]: item for item in manifest["items"]}
    campaigns = {row["id"]: row for row in data["campaigns"]}
    bundle = ROOT / ".local/hg-image-recovery-06b"
    bundle.mkdir(exist_ok=True)
    assets, checks, writes, undos, after, summary = [], [], [], [], [], []

    def require(condition, label):
        return f"IF NOT ({condition}) THEN RAISE EXCEPTION {q(label)}; END IF;"

    def load(value):
        if value.startswith("data:image/"):
            head, encoded = value.split(",", 1)
            if not head.endswith(";base64"):
                raise ValueError("Non-base64 image")
            binary = base64.b64decode(encoded, validate=True)
        else:
            item = media[value]  # Unknown origins are never fetched.
            source = (private / "legacy-public-media" / item["path"]).resolve()
            if not source.is_relative_to((private / "legacy-public-media").resolve()):
                raise ValueError("Unsafe media path")
            binary = source.read_bytes()
            if len(binary) != item["bytes"] or hashlib.sha256(binary).hexdigest() != item["sha256"]:
                raise ValueError("Media integrity mismatch")
        with Image.open(io.BytesIO(binary)) as original:
            original.load()  # Decode, not merely a base64/signature check.
            return ImageOps.exif_transpose(original).convert("RGBA")

    def encode(image, size, jpeg=False):
        image = image.copy()
        image.thumbnail((size, size), Image.Resampling.LANCZOS)
        out = io.BytesIO()
        if jpeg:
            rgb = Image.new("RGB", image.size, "white")
            rgb.paste(image, mask=image.getchannel("A"))
            rgb.save(out, "JPEG", quality=88, optimize=True)
        else:
            image.save(out, "PNG", optimize=True)
        result = out.getvalue()
        if len(result) > (524288 if jpeg and size <= 768 else 5242880):
            raise ValueError("Encoded image exceeds native storage limit")
        return result

    def sqlbytes(binary):
        return "decode(" + q(base64.b64encode(binary).decode()) + ",'base64')"

    def ownership(campaign):
        owner = legacy_user(campaigns[campaign]["owner_profile_id"])
        checks.append(require(
            f"EXISTS(SELECT 1 FROM hollowgate_vtt.campaigns WHERE id={q(campaign)} AND owner_id={q(owner)})",
            "Campaign identity/owner changed: " + campaign))
        return owner

    def visual(campaign, entity, field, value):
        image = load(value)
        source, thumb = encode(image, 1600), encode(image, 256)
        asset = str(uuid.uuid5(uuid.NAMESPACE_URL, f"hollowgate:image-recovery-06:{campaign}:{entity}:{field}"))
        checks.append(require(
            f"NOT EXISTS(SELECT 1 FROM hollowgate_vtt.visual_assets WHERE id={q(asset)} AND campaign_id={q(campaign)})",
            "Recovery asset already exists: " + asset))
        writes.append(
            "INSERT INTO hollowgate_vtt.visual_assets(id,campaign_id,name,asset_type,source_mime,source_data,thumbnail_mime,thumbnail_data) VALUES("
            + ",".join([q(asset), q(campaign), q("Immagine recuperata " + field), "'other'", "'image/png'",
                        sqlbytes(source), "'image/png'", sqlbytes(thumb)]) + ");")
        assets.append({"id": asset, "campaignId": campaign, "sha256": hashlib.sha256(source).hexdigest(),
                       "bytes": len(source), "width": min(image.width, 1600), "field": field})
        after.append(require(
            f"EXISTS(SELECT 1 FROM hollowgate_vtt.visual_assets WHERE id={q(asset)} AND campaign_id={q(campaign)} AND source_mime='image/png' AND thumbnail_mime='image/png' AND source_data={sqlbytes(source)} AND thumbnail_data={sqlbytes(thumb)})",
            "Recovered binary missing/changed: " + asset))
        return asset, f"/vtt/campaigns/{campaign}/visual-assets/{asset}/content"

    for row in data["campaigns"]:
        for old, column in [("logo_url", "logo_asset_id"), ("cover_image_url", "cover_asset_id")]:
            if not row.get(old):
                continue
            campaign = row["id"]
            ownership(campaign)
            checks.append(require(
                f"EXISTS(SELECT 1 FROM hollowgate_vtt.campaigns WHERE id={q(campaign)} AND {column} IS NULL)",
                "Existing campaign image; refusing overwrite: " + campaign))
            checks.append(require(
                f"EXISTS(SELECT 1 FROM hollowgate_vtt.migration_source_records WHERE source_table='campaigns' AND target_id={q(campaign)} AND source_payload->>{q(old)}={q(row[old])})",
                "Campaign historical reference mismatch"))
            asset, _ = visual(campaign, campaign, old, row[old])
            writes.append(f"UPDATE hollowgate_vtt.campaigns SET {column}={q(asset)} WHERE id={q(campaign)};")
            after.append(require(f"EXISTS(SELECT 1 FROM hollowgate_vtt.campaigns WHERE id={q(campaign)} AND {column}={q(asset)})", "Branding verification failed"))
            undos.append(require(f"EXISTS(SELECT 1 FROM hollowgate_vtt.campaigns WHERE id={q(campaign)} AND {column}={q(asset)})", "Campaign image changed after restore"))
            undos.append(f"UPDATE hollowgate_vtt.campaigns SET {column}=NULL WHERE id={q(campaign)};")
            summary.append({"kind": "campaign", "id": campaign, "field": old})

    for row in data["characters"]:
        if not row.get("portrait_url"):
            continue
        entity, campaign = row["id"], row["campaign_id"]
        owner = ownership(campaign)
        checks.append(require(
            f"EXISTS(SELECT 1 FROM hollowgate_vtt.character_drafts WHERE id={q(entity)} AND campaign_id={q(campaign)} AND owner_id={q(owner)} AND sheet_data->'sourceRecord'->>'portrait_url'={q(row['portrait_url'])})",
            "Character historical identity mismatch"))
        for table in ["character_portraits", "character_portrait_sources"]:
            checks.append(require(f"NOT EXISTS(SELECT 1 FROM hollowgate_vtt.{table} WHERE character_id={q(entity)})", "Character already has an image/source"))
        crop = encode(load(row["portrait_url"]), 768, jpeg=True)
        source = encode(load(row.get("portrait_source_image_url") or row["portrait_url"]), 1600, jpeg=True)
        if len(source) > 2097152:
            raise ValueError("Portrait source exceeds limit")
        for table, binary in [("character_portraits", crop), ("character_portrait_sources", source)]:
            writes.append(f"INSERT INTO hollowgate_vtt.{table}(character_id,mime_type,bytes) VALUES({q(entity)},'image/jpeg',{sqlbytes(binary)});")
            condition = f"EXISTS(SELECT 1 FROM hollowgate_vtt.{table} WHERE character_id={q(entity)} AND bytes={sqlbytes(binary)})"
            after.append(require(condition, "Portrait verification failed"))
            undos.append(require(condition, "Portrait changed after restore"))
            undos.append(f"DELETE FROM hollowgate_vtt.{table} WHERE character_id={q(entity)};")
        summary.append({"kind": "character", "id": entity, "field": "portrait"})

    aliases = {
        "portrait_crop": "portraitCrop", "portrait_crop_area": "portraitCropArea",
        "portrait_rotation_degrees": "portraitRotationDegrees",
        "cover_crop": "coverCrop", "cover_rotation_degrees": "coverRotationDegrees",
        "cover_image_scale": "coverImageScale",
    }
    for kind in ["npcs", "monsters"]:
        for row in data[kind]:
            imagefields = {old: modern for old, modern in [
                ("portrait_image_url", "portraitImageUrl"),
                ("portrait_source_image_url", "portraitSourceImageUrl"),
                ("cover_image_url", "coverImageUrl")] if row.get(old)}
            if not imagefields:
                continue
            entity, campaign = row["id"], row["campaign_id"]
            ownership(campaign)
            where = f"id={q(entity)} AND campaign_id={q(campaign)} AND kind={q(kind)}"
            changes = {}
            for old, modern in imagefields.items():
                checks.append(require(
                    f"EXISTS(SELECT 1 FROM hollowgate_vtt.narrative_content_documents WHERE {where} AND payload->>{q(old)}={q(row[old])} AND NOT payload ? {q(modern)})",
                    "Narrative historical reference changed or modern field exists: " + entity))
                asset, url = visual(campaign, entity, old, row[old])
                changes[modern] = url
                if modern == "portraitImageUrl":
                    checks.append(require(f"EXISTS(SELECT 1 FROM hollowgate_vtt.narrative_content_documents WHERE {where} AND NOT payload ? 'portraitAssetId')", "Portrait asset association already exists"))
                    changes["portraitAssetId"] = asset
            for old, modern in aliases.items():
                if row.get(old) is not None:
                    checks.append(require(f"EXISTS(SELECT 1 FROM hollowgate_vtt.narrative_content_documents WHERE {where} AND payload->{q(old)}={js(row[old])} AND NOT payload ? {q(modern)})", "Image crop metadata changed"))
                    changes[modern] = row[old]
            writes.append(f"UPDATE hollowgate_vtt.narrative_content_documents SET payload=payload || {js(changes)} WHERE {where};")
            condition = f"EXISTS(SELECT 1 FROM hollowgate_vtt.narrative_content_documents WHERE {where} AND payload @> {js(changes)})"
            after.append(require(condition, "Narrative image verification failed"))
            undos.append(require(condition, "Narrative image changed after restore"))
            keys = "ARRAY[" + ",".join(q(k) for k in changes) + "]::text[]"
            undos.append(f"UPDATE hollowgate_vtt.narrative_content_documents SET payload=payload - {keys} WHERE {where};")
            summary.append({"kind": kind, "id": entity, "fields": list(changes)})

    locks = """SET LOCAL lock_timeout='8s';
SET LOCAL statement_timeout='90s';
LOCK TABLE hollowgate_vtt.campaigns,hollowgate_vtt.character_drafts,
hollowgate_vtt.character_portraits,hollowgate_vtt.character_portrait_sources,
hollowgate_vtt.narrative_content_documents,hollowgate_vtt.visual_assets
IN SHARE ROW EXCLUSIVE MODE;
"""
    def block(lines):
        return "DO $recovery$\nBEGIN\n" + "\n".join(lines) + "\nEND\n$recovery$;\n"
    (bundle / "preflight.sql").write_text("BEGIN READ ONLY;\n" + block(checks) + "ROLLBACK;\n", encoding="utf-8")
    (bundle / "apply.sql").write_text("BEGIN;\n" + locks + block(checks + writes + after) + "COMMIT;\n", encoding="utf-8")
    # Rollback detaches only restored references and keeps inserted visual assets:
    # they may have gained legitimate references since recovery.
    (bundle / "rollback.sql").write_text("BEGIN;\n" + locks + block(undos) + "COMMIT;\n", encoding="utf-8")
    (bundle / "verify.sql").write_text("BEGIN READ ONLY;\n" + block(after) + "ROLLBACK;\n", encoding="utf-8")
    # Portrait/source INSERT and DELETE each touch the PG via migration 039.
    # Permit only the exact expected revision delta, not arbitrary revision edits.
    portrait_ids = [item["id"] for item in summary if item["kind"] == "character"]
    targets = ",".join(q(value) for value in portrait_ids)
    signatures = []
    for table in ["campaigns", "character_drafts", "narrative_content_documents",
                  "character_portraits", "character_portrait_sources"]:
        value = "to_jsonb(t)"
        if table == "character_drafts" and portrait_ids:
            value = (f"CASE WHEN id IN ({targets}) THEN "
                     "(to_jsonb(t)-'updated_at') || jsonb_build_object('revision',revision - :revision_delta) "
                     "ELSE to_jsonb(t) END")
        signatures.append(
            f"SELECT {q(table)},count(*),md5(coalesce(string_agg(md5(v::text),'' ORDER BY v::text),'')) "
            f"FROM (SELECT {value} AS v FROM hollowgate_vtt.{table} t) s;")
    (bundle / "rollback-signature.sql").write_text("\n".join(signatures) + "\n", encoding="utf-8")
    (bundle / "summary.json").write_text(json.dumps({"associations": summary, "assets": assets}, indent=2) + "\n", encoding="utf-8")
    shutil.copyfile(ROOT / "deploy/aruba/production/recover-images.sh", bundle / "recover-images.sh")
    with (bundle / "SHA256SUMS").open("w", encoding="utf-8", newline="\n") as out:
        for p in sorted(bundle.iterdir()):
            if p.is_file() and p.name != "SHA256SUMS":
                out.write(hashlib.sha256(p.read_bytes()).hexdigest() + "  " + p.name + "\n")
    archive = bundle.with_suffix(".tar.gz")
    with tarfile.open(archive, "w:gz") as tar:
        tar.add(bundle, arcname=bundle.name)
    print(f"IMAGE_BUNDLE_OK: associations={len(summary)}; assets={len(assets)}")
    print("SHA256=" + hashlib.sha256(archive.read_bytes()).hexdigest())

if __name__ == "__main__":
    build()
