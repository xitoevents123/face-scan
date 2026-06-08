import { LibraryImage, SearchMatch } from "@workspace/api-client-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Trash2, UserSquare2 } from "lucide-react";
import { Button } from "@/components/ui/button";

interface ImageCardProps {
  image: LibraryImage | SearchMatch;
  onDelete?: (id: number) => void;
  isDeleting?: boolean;
}

export function ImageCard({ image, onDelete, isDeleting }: ImageCardProps) {
  const isMatch = "score" in image;
  const score = isMatch ? (image as SearchMatch).score : undefined;

  return (
    <Card className="overflow-hidden group relative bg-secondary border-border hover:border-primary/50 transition-all duration-300">
      <CardContent className="p-0">
        <div className="aspect-square relative bg-background">
          <img
            src={image.url}
            alt={image.originalName}
            className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
            loading="lazy"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent opacity-60 group-hover:opacity-80 transition-opacity" />
          
          {/* Top Info */}
          <div className="absolute top-2 left-2 right-2 flex justify-between items-start">
            <Badge variant="secondary" className="bg-black/60 text-white border-black/80 backdrop-blur-md font-mono text-xs">
              <UserSquare2 className="w-3 h-3 mr-1.5 text-primary" />
              {image.faceCount} {image.faceCount === 1 ? 'face' : 'faces'}
            </Badge>

            {onDelete && (
              <Button
                variant="destructive"
                size="icon"
                className="h-7 w-7 opacity-0 group-hover:opacity-100 transition-opacity"
                onClick={() => onDelete(image.id || (image as SearchMatch).imageId)}
                disabled={isDeleting}
                data-testid={`btn-delete-${image.id}`}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            )}
          </div>

          {/* Bottom Info */}
          <div className="absolute bottom-2 left-2 right-2">
            <p className="text-xs text-gray-300 truncate font-mono" title={image.originalName}>
              {image.originalName}
            </p>
            {isMatch && score !== undefined && (
              <div className="mt-1.5 flex items-center">
                <div className="h-1.5 flex-1 bg-black/50 rounded-full overflow-hidden">
                  <div 
                    className="h-full bg-primary" 
                    style={{ width: `${Math.round(score * 100)}%` }} 
                  />
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
