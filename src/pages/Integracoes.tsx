import { TenantIntegrations } from '@/components/tenant/TenantIntegrations';

const Integracoes = () => {
  return (
    <div className="space-y-6 p-6">
      <div>
        <h1 className="text-3xl font-bold">Integrações</h1>
        <p className="text-muted-foreground">
          Configure suas integrações com sistemas externos
        </p>
      </div>
      <TenantIntegrations />
    </div>
  );
};

export default Integracoes;