import Barcode from 'react-barcode';

interface LabelData {
  trackingCode: string;
  serviceName: string;
  sender: {
    nome: string;
    logradouro: string;
    numero: string;
    complemento?: string;
    bairro: string;
    cep: string;
    cidade: string;
    uf: string;
  };
  recipient: {
    nome: string;
    logradouro: string;
    numero: string;
    complemento?: string;
    bairro: string;
    cep: string;
    cidade: string;
    uf: string;
  };
  orderId: number;
}

interface CorreiosLabelPrintProps {
  labels: LabelData[];
}

function SingleLabel({ label }: { label: LabelData }) {
  const formatCep = (cep: string) => {
    const clean = cep.replace(/\D/g, '');
    return clean.length === 8 ? `${clean.slice(0, 5)}-${clean.slice(5)}` : cep;
  };

  const serviceColor = label.serviceName === 'SEDEX' ? '#7B1FA2' : '#1565C0';
  const serviceBg = label.serviceName === 'SEDEX' ? '#F3E5F5' : '#E3F2FD';

  return (
    <div
      className="label-page"
      style={{
        width: '100mm',
        height: '150mm',
        border: '1px solid #000',
        padding: '4mm',
        fontFamily: 'Arial, sans-serif',
        fontSize: '10px',
        boxSizing: 'border-box',
        pageBreakAfter: 'always',
        display: 'flex',
        flexDirection: 'column',
        gap: '2mm',
        background: '#fff',
        color: '#000',
      }}
    >
      {/* Header: Service + Correios */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '2px solid #000', paddingBottom: '2mm' }}>
        <div style={{ fontSize: '18px', fontWeight: 'bold', color: serviceColor, background: serviceBg, padding: '2px 8px', borderRadius: '4px' }}>
          {label.serviceName}
        </div>
        <div style={{ fontSize: '14px', fontWeight: 'bold', color: '#FFD600' }}>
          <span style={{ color: '#FFD600', background: '#003DA5', padding: '2px 6px', borderRadius: '2px' }}>CORREIOS</span>
        </div>
        <div style={{ fontSize: '9px', color: '#666' }}>
          Pedido #{label.orderId}
        </div>
      </div>

      {/* Tracking barcode */}
      <div style={{ textAlign: 'center', borderBottom: '1px dashed #999', paddingBottom: '2mm' }}>
        <Barcode
          value={label.trackingCode}
          format="CODE128"
          width={1.5}
          height={40}
          displayValue={true}
          fontSize={12}
          margin={2}
          background="#ffffff"
          lineColor="#000000"
        />
      </div>

      {/* Recipient (main) */}
      <div style={{ flex: 1, border: '2px solid #000', padding: '3mm', borderRadius: '2px' }}>
        <div style={{ fontSize: '9px', fontWeight: 'bold', color: '#666', marginBottom: '2mm', textTransform: 'uppercase' }}>
          Destinatário
        </div>
        <div style={{ fontSize: '13px', fontWeight: 'bold', marginBottom: '1mm' }}>
          {label.recipient.nome}
        </div>
        <div style={{ fontSize: '11px', lineHeight: '1.4' }}>
          {label.recipient.logradouro}, {label.recipient.numero}
          {label.recipient.complemento ? ` - ${label.recipient.complemento}` : ''}
        </div>
        <div style={{ fontSize: '11px' }}>
          {label.recipient.bairro}
        </div>
        <div style={{ fontSize: '11px', marginTop: '1mm' }}>
          <strong>{label.recipient.cidade} - {label.recipient.uf}</strong>
        </div>
        <div style={{ fontSize: '20px', fontWeight: 'bold', marginTop: '3mm', letterSpacing: '2px' }}>
          {formatCep(label.recipient.cep)}
        </div>
      </div>

      {/* Sender */}
      <div style={{ border: '1px solid #999', padding: '2mm', borderRadius: '2px', fontSize: '9px' }}>
        <div style={{ fontWeight: 'bold', color: '#666', marginBottom: '1mm', textTransform: 'uppercase' }}>
          Remetente
        </div>
        <div><strong>{label.sender.nome}</strong></div>
        <div>
          {label.sender.logradouro}, {label.sender.numero}
          {label.sender.complemento ? ` - ${label.sender.complemento}` : ''}
        </div>
        <div>{label.sender.bairro} - {label.sender.cidade}/{label.sender.uf}</div>
        <div>CEP: {formatCep(label.sender.cep)}</div>
      </div>
    </div>
  );
}

export default function CorreiosLabelPrint({ labels }: CorreiosLabelPrintProps) {
  const handlePrint = () => {
    window.print();
  };

  return (
    <div>
      <style>{`
        @media print {
          body * { visibility: hidden; }
          .label-print-area, .label-print-area * { visibility: visible; }
          .label-print-area { position: absolute; top: 0; left: 0; }
          .no-print { display: none !important; }
          @page { size: 100mm 150mm; margin: 0; }
        }
      `}</style>

      <div className="no-print mb-4 flex justify-end">
        <button
          onClick={handlePrint}
          className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
        >
          Imprimir Etiquetas ({labels.length})
        </button>
      </div>

      <div className="label-print-area flex flex-wrap gap-4 justify-center">
        {labels.map((label, index) => (
          <SingleLabel key={index} label={label} />
        ))}
      </div>
    </div>
  );
}

export type { LabelData };
