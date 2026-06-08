import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { UserSquare2, ImageOff } from "lucide-react";
import type { PCloudImage } from "@/pages/home";

interface PCloudImageCardProps {
  image: PCloudImage;
  score?: number;
}

export function PCloudImageCard({ image, score }: PCloudImageCardProps) {
  const [imgError, setImgError] = useState(false);
  const displayName = image.original_name ?? image.pcloud_file_id;

  return (
    <Card className="overflow-hidden group relative bg-secondary border-border hover:border-primary/50 transition-all duration-300">
      <CardContent className="p-0">
        <div className="aspect-square relative bg-background">
          {imgError || !image.pcloud_url ? (
            <div className="w-full h-full flex flex-col items-center justify-center text-muted-foreground gap-2">
              <ImageOff className="w-8 h-8 opacity-40" />
              <span className="text-[10px] font-mono opacity-60 text-center px-2 break-all">{image.pcloud_file_id}</span>
            </div>
          ) : (
            <img
              src={image.pcloud_url}
              alt={displayName}
              className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
              loading="lazy"
              onError={() => setImgError(true)}
            />
          )}

          <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent opacity-60 group-hover:opacity-80 transition-opacity" />

          {/* Top: face count badge */}
          <div className="absolute top-2 left-2 right-2 flex justify-between items-start">
            <Badge variant="secondary" className="bg-black/60 text-white border-black/80 backdrop-blur-md font-mono text-xs">
              <UserSquare2 className="w-3 h-3 mr-1.5 text-primary" />
              {image.face_count} {image.face_count === 1 ? "face" : "faces"}
            </Badge>
          </div>

          {/* Bottom: filename + optional match score */}
          <div className="absolute bottom-2 left-2 right-2">
            <p className="text-xs text-gray-300 truncate font-mono" title={displayName}>
              {displayName}
            </p>
            {score !== undefined && (
              <div className="mt-1.5 flex items-center">
                <div className="h-1.5 flex-1 bg-black/50 rounded-full overflow-hidden">
                  <div className="h-full bg-primary" style={{ width: `${Math.round(score * 100)}%` }} />
                </div>
                <span className="ml-2 text-xs font-mono font-bold text-primary">
                  {Math.round(score * 100)}%
                </span>
              </div>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
