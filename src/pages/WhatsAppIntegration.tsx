import Navbar from '@/components/Navbar';
import WhatsAppIntegration from '@/components/WhatsAppIntegration';

const WhatsAppIntegrationPage = () => {
  return (
    <>
      <Navbar />
      <div className="container mx-auto px-4 py-8">
        <WhatsAppIntegration />
      </div>
    </>
  );
};

export default WhatsAppIntegrationPage;