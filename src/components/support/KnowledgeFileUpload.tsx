import { useState, useRef } from 'react';
import { Upload, File, Image, Video, FileAudio, FileText, X, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

interface KnowledgeFileUploadProps {
  tenantId: string;
  onUploadComplete: (fileData: {
    file_url: string;
    file_name: string;
    file_type: 'document' | 'image' | 'video' | 'audio';
    file_size: number;
  }) => void;
  currentFile?: {
    file_url?: string;
    file_name?: string;
    file_type?: string;
  };
  onRemove?: () => void;
}

const FILE_TYPE_CONFIG = {
  document: {
    icon: FileText,
    accept: '.pdf,.doc,.docx,.txt',
    mimeTypes: ['application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'text/plain'],
    label: 'Documento',
    color: 'text-blue-500'
  },
  image: {
    icon: Image,
    accept: '.jpg,.jpeg,.png,.gif,.webp',
    mimeTypes: ['image/jpeg', 'image/png', 'image/gif', 'image/webp'],
    label: 'Imagem',
    color: 'text-green-500'
  },
  video: {
    icon: Video,
    accept: '.mp4,.webm',
    mimeTypes: ['video/mp4', 'video/webm'],
    label: 'Vídeo',
    color: 'text-purple-500'
  },
  audio: {
    icon: FileAudio,
    accept: '.mp3,.wav,.mpeg',
    mimeTypes: ['audio/mpeg', 'audio/wav', 'audio/mp3'],
    label: 'Áudio',
    color: 'text-orange-500'
  }
};

function getFileTypeFromMime(mimeType: string): 'document' | 'image' | 'video' | 'audio' {
  for (const [type, config] of Object.entries(FILE_TYPE_CONFIG)) {
    if (config.mimeTypes.some(m => mimeType.startsWith(m.split('/')[0]) || mimeType === m)) {
      return type as 'document' | 'image' | 'video' | 'audio';
    }
  }
  return 'document';
}

function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

export function KnowledgeFileUpload({ 
  tenantId, 
  onUploadComplete, 
  currentFile,
  onRemove 
}: KnowledgeFileUploadProps) {
  const [uploading, setUploading] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const allAcceptedTypes = Object.values(FILE_TYPE_CONFIG)
    .map(c => c.accept)
    .join(',');

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      await uploadFile(e.dataTransfer.files[0]);
    }
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      await uploadFile(e.target.files[0]);
    }
  };

  const uploadFile = async (file: File) => {
    // Validate file size (50MB max)
    if (file.size > 52428800) {
      toast.error('Arquivo muito grande. Máximo: 50MB');
      return;
    }

    const fileType = getFileTypeFromMime(file.type);
    
    // Validate mime type
    const allMimeTypes = Object.values(FILE_TYPE_CONFIG).flatMap(c => c.mimeTypes);
    if (!allMimeTypes.some(m => file.type === m || file.type.startsWith(m.split('/')[0] + '/'))) {
      toast.error('Tipo de arquivo não suportado');
      return;
    }

    setUploading(true);

    try {
      const fileExt = file.name.split('.').pop();
      const fileName = `${tenantId}/${Date.now()}-${Math.random().toString(36).substring(7)}.${fileExt}`;

      const { data, error } = await supabase.storage
        .from('knowledge-files')
        .upload(fileName, file, {
          cacheControl: '3600',
          upsert: false
        });

      if (error) {
        throw error;
      }

      const { data: urlData } = supabase.storage
        .from('knowledge-files')
        .getPublicUrl(data.path);

      onUploadComplete({
        file_url: urlData.publicUrl,
        file_name: file.name,
        file_type: fileType,
        file_size: file.size
      });

      toast.success('Arquivo enviado!');
    } catch (error: any) {
      console.error('Upload error:', error);
      toast.error('Erro ao enviar arquivo: ' + (error.message || 'Erro desconhecido'));
    } finally {
      setUploading(false);
    }
  };

  const FileIcon = currentFile?.file_type 
    ? FILE_TYPE_CONFIG[currentFile.file_type as keyof typeof FILE_TYPE_CONFIG]?.icon || File
    : File;

  const fileColor = currentFile?.file_type 
    ? FILE_TYPE_CONFIG[currentFile.file_type as keyof typeof FILE_TYPE_CONFIG]?.color || 'text-muted-foreground'
    : 'text-muted-foreground';

  if (currentFile?.file_url) {
    return (
      <Card className="p-4">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className={cn("p-2 rounded-lg bg-muted", fileColor)}>
              <FileIcon className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <p className="font-medium truncate">{currentFile.file_name}</p>
              <p className="text-sm text-muted-foreground capitalize">
                {FILE_TYPE_CONFIG[currentFile.file_type as keyof typeof FILE_TYPE_CONFIG]?.label || 'Arquivo'}
              </p>
            </div>
          </div>
          {onRemove && (
            <Button variant="ghost" size="icon" onClick={onRemove} className="shrink-0">
              <X className="w-4 h-4" />
            </Button>
          )}
        </div>
        
        {/* Preview for images and videos */}
        {currentFile.file_type === 'image' && (
          <img 
            src={currentFile.file_url} 
            alt={currentFile.file_name} 
            className="mt-3 rounded-lg max-h-48 object-cover w-full"
          />
        )}
        {currentFile.file_type === 'video' && (
          <video 
            src={currentFile.file_url} 
            controls 
            className="mt-3 rounded-lg max-h-48 w-full"
          />
        )}
        {currentFile.file_type === 'audio' && (
          <audio 
            src={currentFile.file_url} 
            controls 
            className="mt-3 w-full"
          />
        )}
      </Card>
    );
  }

  return (
    <div
      className={cn(
        "border-2 border-dashed rounded-lg p-6 transition-colors cursor-pointer",
        dragActive ? "border-primary bg-primary/5" : "border-muted-foreground/25 hover:border-primary/50",
        uploading && "pointer-events-none opacity-50"
      )}
      onDragEnter={handleDrag}
      onDragLeave={handleDrag}
      onDragOver={handleDrag}
      onDrop={handleDrop}
      onClick={() => fileInputRef.current?.click()}
    >
      <input
        ref={fileInputRef}
        type="file"
        accept={allAcceptedTypes}
        onChange={handleFileSelect}
        className="hidden"
      />
      
      <div className="flex flex-col items-center gap-3 text-center">
        {uploading ? (
          <Loader2 className="w-10 h-10 text-primary animate-spin" />
        ) : (
          <Upload className="w-10 h-10 text-muted-foreground" />
        )}
        
        <div>
          <p className="font-medium">
            {uploading ? 'Enviando...' : 'Arraste um arquivo ou clique para selecionar'}
          </p>
          <p className="text-sm text-muted-foreground mt-1">
            Documentos, imagens, vídeos ou áudios (máx. 50MB)
          </p>
        </div>

        <div className="flex gap-4 mt-2">
          {Object.entries(FILE_TYPE_CONFIG).map(([key, config]) => {
            const Icon = config.icon;
            return (
              <div key={key} className="flex items-center gap-1 text-xs text-muted-foreground">
                <Icon className={cn("w-4 h-4", config.color)} />
                <span>{config.label}</span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
