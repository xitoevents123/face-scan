import { S3Client, ListObjectsV2Command, type ListObjectsV2CommandOutput } from "@aws-sdk/client-s3";

const accountId = process.env.R2_ACCOUNT_ID;
const accessKeyId = process.env.R2_ACCESS_KEY_ID;
const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
export const bucketName = process.env.R2_BUCKET_NAME;
export const publicUrl = (process.env.R2_PUBLIC_URL ?? "").replace(/\/$/, "");

if (!accountId || !accessKeyId || !secretAccessKey || !bucketName) {
  throw new Error("R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET_NAME must be set");
}

export const r2 = new S3Client({
  region: "auto",
  endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId,
    secretAccessKey,
  },
});

export interface R2Image {
  key: string;
  url: string;
  folder: string;
  filename: string;
  size: number;
  lastModified: string;
}

const IMAGE_EXTS = new Set([".jpg", ".jpeg", ".png", ".webp", ".gif", ".avif"]);

function isImage(key: string): boolean {
  const ext = key.slice(key.lastIndexOf(".")).toLowerCase();
  return IMAGE_EXTS.has(ext);
}

export async function listAllImages(prefix?: string): Promise<R2Image[]> {
  const results: R2Image[] = [];
  let continuationToken: string | undefined;

  do {
    const cmd = new ListObjectsV2Command({
      Bucket: bucketName,
      Prefix: prefix,
      ContinuationToken: continuationToken,
      MaxKeys: 1000,
    });

    const res: ListObjectsV2CommandOutput = await r2.send(cmd);

    for (const obj of res.Contents ?? []) {
      if (!obj.Key || !isImage(obj.Key)) continue;
      const parts = obj.Key.split("/");
      const filename = parts[parts.length - 1];
      const folder = parts.length > 1 ? parts.slice(0, -1).join("/") : "";
      results.push({
        key: obj.Key,
        url: `${publicUrl}/${obj.Key}`,
        folder,
        filename,
        size: obj.Size ?? 0,
        lastModified: obj.LastModified?.toISOString() ?? new Date().toISOString(),
      });
    }

    continuationToken = res.NextContinuationToken;
  } while (continuationToken);

  return results;
}
