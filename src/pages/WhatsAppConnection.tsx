import Navbar from '@/components/Navbar';
import WhatsAppConnection from '@/components/WhatsAppConnection';

const WhatsAppConnectionPage = () => {
  return (
    <>
      <Navbar />
      <div className="container mx-auto px-4 py-8">
        <WhatsAppConnection />
      </div>
    </>
  );
};

export default WhatsAppConnectionPage;