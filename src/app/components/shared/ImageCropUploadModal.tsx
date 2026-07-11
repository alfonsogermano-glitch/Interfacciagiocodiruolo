import { X } from 'lucide-react';
import { ImageCropCore, type ImageCropCoreProps } from './ImageCropCore';

interface ImageCropUploadModalProps extends Omit<ImageCropCoreProps, 'onClose'> {
  onClose: () => void;
}

export function ImageCropUploadModal(props: ImageCropUploadModalProps) {
  const { onClose } = props;

  const overlayStyle: React.CSSProperties = {
    position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.9)', zIndex: 1100,
    display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem',
  };
  const cardStyle: React.CSSProperties = {
    backgroundColor: 'var(--dash-bg)', border: '1px solid var(--dash-border-soft)', borderRadius: 16,
    padding: '1.75rem', width: '100%', maxWidth: 420, fontFamily: 'sans-serif', position: 'relative',
  };

  return (
    <div style={overlayStyle} onClick={onClose}>
      <div style={cardStyle} onClick={e => e.stopPropagation()}>
        <button type="button" onClick={onClose} aria-label="Chiudi"
          style={{ position: 'absolute', top: '0.85rem', right: '0.85rem', background: 'none', border: 'none',
                   color: 'var(--dash-muted)', cursor: 'pointer', display: 'flex', padding: '0.25rem' }}>
          <X size={18} />
        </button>

        <ImageCropCore {...props} />
      </div>
    </div>
  );
}
