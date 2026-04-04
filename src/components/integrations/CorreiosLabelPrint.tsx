import Barcode from 'react-barcode';

interface LabelData {
  trackingCode: string;
  serviceName: string;
  contrato?: string;
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

function formatTrackingCode(code: string) {
  if (!code || code.length < 13) return code;
  // Format: XX 999 999 999 BR
  return `${code.slice(0, 2)} ${code.slice(2, 5)} ${code.slice(5, 8)} ${code.slice(8, 11)} ${code.slice(11)}`;
}

function formatCep(cep: string) {
  const clean = cep.replace(/\D/g, '');
  return clean.length === 8 ? `${clean.slice(0, 5)}-${clean.slice(5)}` : cep;
}

function SingleLabel({ label }: { label: LabelData }) {
  const serviceLabel = label.serviceName?.toUpperCase() || 'PAC';

  return (
    <div
      className="label-page"
      style={{
        width: '100mm',
        height: '150mm',
        border: '2px solid #000',
        fontFamily: 'Arial, Helvetica, sans-serif',
        fontSize: '9px',
        boxSizing: 'border-box',
        pageBreakAfter: 'always',
        display: 'flex',
        flexDirection: 'column',
        background: '#fff',
        color: '#000',
        overflow: 'hidden',
      }}
    >
      {/* === ROW 1: Barcode + Service/Contract === */}
      <div style={{ display: 'flex', borderBottom: '2px solid #000' }}>
        {/* Barcode left */}
        <div style={{ flex: 1, padding: '2mm 3mm', display: 'flex', alignItems: 'center', justifyContent: 'center', borderRight: '2px solid #000' }}>
          <Barcode
            value={label.trackingCode}
            format="CODE128"
            width={1.2}
            height={38}
            displayValue={false}
            margin={0}
            background="#ffffff"
            lineColor="#000000"
          />
        </div>
        {/* Service + info right */}
        <div style={{ width: '32mm', padding: '2mm 3mm', display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', gap: '1mm' }}>
          <div style={{
            fontSize: '16px',
            fontWeight: 'bold',
            background: serviceLabel === 'SEDEX' ? '#7B1FA2' : serviceLabel === 'PAC' ? '#1565C0' : '#333',
            color: '#fff',
            padding: '1px 8px',
            borderRadius: '2px',
            textAlign: 'center',
            width: '100%',
          }}>
            {serviceLabel}
          </div>
          <div style={{ fontSize: '7px', color: '#333', textAlign: 'center' }}>
            {label.contrato ? `Contrato: ${label.contrato}` : ''}
          </div>
          <div style={{ fontSize: '7px', color: '#333' }}>Volume: 1/1</div>
          <div style={{
            fontSize: '11px',
            fontWeight: 'bold',
            background: '#FFD600',
            color: '#003DA5',
            padding: '1px 6px',
            borderRadius: '2px',
            textAlign: 'center',
          }}>
            CORREIOS
          </div>
        </div>
      </div>

      {/* === ROW 2: Tracking code text === */}
      <div style={{ borderBottom: '1px solid #000', padding: '1.5mm 3mm', textAlign: 'center' }}>
        <div style={{ fontSize: '14px', fontWeight: 'bold', letterSpacing: '3px' }}>
          {formatTrackingCode(label.trackingCode)}
        </div>
      </div>

      {/* === ROW 3: Recebedor / Assinatura === */}
      <div style={{ borderBottom: '2px solid #000', padding: '2mm 3mm', display: 'flex', gap: '4mm' }}>
        <div style={{ flex: 1 }}>
          <span style={{ fontSize: '8px' }}>Recebedor: </span>
          <span style={{ borderBottom: '1px solid #999', display: 'inline-block', width: '90%', minHeight: '10px' }}></span>
        </div>
        <div style={{ flex: 1, display: 'flex', gap: '2mm' }}>
          <div style={{ flex: 1 }}>
            <span style={{ fontSize: '8px' }}>Assinatura: </span>
            <span style={{ borderBottom: '1px solid #999', display: 'inline-block', width: '80%', minHeight: '10px' }}></span>
          </div>
          <div style={{ flex: 1 }}>
            <span style={{ fontSize: '8px' }}>Documento: </span>
            <span style={{ borderBottom: '1px solid #999', display: 'inline-block', width: '80%', minHeight: '10px' }}></span>
          </div>
        </div>
      </div>

      {/* === ROW 4: DESTINATÁRIO block === */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', borderBottom: '2px solid #000' }}>
        {/* Title bar */}
        <div style={{
          background: '#000',
          color: '#fff',
          padding: '1.5mm 3mm',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}>
          <span style={{ fontSize: '11px', fontWeight: 'bold', letterSpacing: '2px' }}>DESTINATÁRIO</span>
          <span style={{
            fontSize: '9px',
            fontWeight: 'bold',
            background: '#FFD600',
            color: '#003DA5',
            padding: '0 4px',
            borderRadius: '1px',
          }}>CORREIOS</span>
        </div>

        {/* Recipient data */}
        <div style={{ padding: '2mm 3mm', flex: 1, display: 'flex', flexDirection: 'column', gap: '0.5mm' }}>
          <div style={{ fontSize: '12px', fontWeight: 'bold' }}>{label.recipient.nome}</div>
          <div style={{ fontSize: '10px' }}>
            {label.recipient.logradouro}, {label.recipient.numero}
            {label.recipient.complemento ? ` - ${label.recipient.complemento}` : ''}
          </div>
          <div style={{ fontSize: '10px' }}>{label.recipient.bairro}</div>

          {/* CEP + City/UF highlight */}
          <div style={{ marginTop: 'auto', display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', paddingTop: '2mm' }}>
            <div>
              <div style={{ fontSize: '22px', fontWeight: 'bold', letterSpacing: '2px' }}>
                {formatCep(label.recipient.cep)}
              </div>
              <div style={{ fontSize: '11px', fontWeight: 'bold' }}>
                {label.recipient.cidade} / {label.recipient.uf}
              </div>
            </div>
          </div>
        </div>

        {/* CEP barcode */}
        <div style={{ borderTop: '1px solid #000', padding: '1.5mm 3mm', display: 'flex', justifyContent: 'center' }}>
          <Barcode
            value={label.recipient.cep.replace(/\D/g, '') || '00000000'}
            format="CODE128"
            width={1.5}
            height={30}
            displayValue={false}
            margin={0}
            background="#ffffff"
            lineColor="#000000"
          />
        </div>
      </div>

      {/* === ROW 5: REMETENTE block === */}
      <div style={{ padding: '2mm 3mm', fontSize: '8px', lineHeight: '1.5' }}>
        <div style={{ fontWeight: 'bold', fontSize: '9px', marginBottom: '0.5mm', textTransform: 'uppercase', letterSpacing: '1px' }}>
          Remetente:
        </div>
        <div><strong>{label.sender.nome}</strong></div>
        <div>
          {label.sender.logradouro}, {label.sender.numero}
          {label.sender.complemento ? ` - ${label.sender.complemento}` : ''}
          {' - '}{label.sender.bairro}
        </div>
        <div>
          {formatCep(label.sender.cep)} - {label.sender.cidade}/{label.sender.uf}
        </div>
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
