'use client'

import { useState, useEffect } from 'react'
import QRCodeDisplay from '@/components/whatsapp/QRCodeDisplay'

export default function WhatsAppPage() {
  // Por enquanto, usar um tenant ID fixo
  // TODO: Pegar do contexto de autenticação/tenant
  const [tenantId, setTenantId] = useState('08f2b1b9-3988-489e-8186-c60f0c0b0622')
  const [customTenantId, setCustomTenantId] = useState('')

  const handleChangeTenant = () => {
    if (customTenantId.trim()) {
      setTenantId(customTenantId.trim())
    }
  }

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="md:flex md:items-center md:justify-between">
        <div className="flex-1 min-w-0">
          <h2 className="text-2xl font-bold leading-7 text-gray-900 sm:text-3xl sm:truncate">
            Integração WhatsApp
          </h2>
          <p className="mt-1 text-sm text-gray-500">
            Conecte seu WhatsApp para enviar mensagens automáticas aos clientes
          </p>
        </div>
      </div>

      {/* Tenant ID Selector (Temporário para testes) */}
      <div className="bg-yellow-50 border-l-4 border-yellow-400 p-4">
        <div className="flex">
          <div className="flex-shrink-0">
            <svg className="h-5 w-5 text-yellow-400" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
            </svg>
          </div>
          <div className="ml-3 flex-1">
            <p className="text-sm text-yellow-700">
              <strong>Modo de Teste:</strong> Você pode alterar o Tenant ID temporariamente para testes
            </p>
            <div className="mt-3 flex gap-2">
              <input
                type="text"
                value={customTenantId}
                onChange={(e) => setCustomTenantId(e.target.value)}
                placeholder="Digite um Tenant ID personalizado"
                className="flex-1 min-w-0 block w-full px-3 py-2 rounded-md border border-gray-300 focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
              />
              <button
                onClick={handleChangeTenant}
                className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-yellow-600 hover:bg-yellow-700"
              >
                Alterar
              </button>
              <button
                onClick={() => {
                  setTenantId('08f2b1b9-3988-489e-8186-c60f0c0b0622')
                  setCustomTenantId('')
                }}
                className="inline-flex items-center px-4 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50"
              >
                Restaurar Padrão
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* QR Code Component */}
      <QRCodeDisplay tenantId={tenantId} />

      {/* Information Cards */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Como Funciona */}
        <div className="bg-white shadow rounded-lg p-6">
          <h3 className="text-lg font-medium text-gray-900 mb-4">
            Como conectar o WhatsApp
          </h3>
          <ol className="space-y-3 text-sm text-gray-600">
            <li className="flex items-start">
              <span className="flex-shrink-0 inline-flex items-center justify-center h-6 w-6 rounded-full bg-blue-100 text-blue-600 font-semibold mr-3">
                1
              </span>
              <span>Clique no botão "Conectar WhatsApp"</span>
            </li>
            <li className="flex items-start">
              <span className="flex-shrink-0 inline-flex items-center justify-center h-6 w-6 rounded-full bg-blue-100 text-blue-600 font-semibold mr-3">
                2
              </span>
              <span>Aguarde o QR Code ser gerado (pode levar alguns segundos)</span>
            </li>
            <li className="flex items-start">
              <span className="flex-shrink-0 inline-flex items-center justify-center h-6 w-6 rounded-full bg-blue-100 text-blue-600 font-semibold mr-3">
                3
              </span>
              <span>Abra o WhatsApp no seu celular</span>
            </li>
            <li className="flex items-start">
              <span className="flex-shrink-0 inline-flex items-center justify-center h-6 w-6 rounded-full bg-blue-100 text-blue-600 font-semibold mr-3">
                4
              </span>
              <span>Vá em Configurações → Aparelhos conectados → Conectar um aparelho</span>
            </li>
            <li className="flex items-start">
              <span className="flex-shrink-0 inline-flex items-center justify-center h-6 w-6 rounded-full bg-blue-100 text-blue-600 font-semibold mr-3">
                5
              </span>
              <span>Escaneie o QR Code exibido na tela</span>
            </li>
            <li className="flex items-start">
              <span className="flex-shrink-0 inline-flex items-center justify-center h-6 w-6 rounded-full bg-blue-100 text-blue-600 font-semibold mr-3">
                6
              </span>
              <span>Aguarde a confirmação da conexão (automático)</span>
            </li>
          </ol>
        </div>

        {/* Recursos */}
        <div className="bg-white shadow rounded-lg p-6">
          <h3 className="text-lg font-medium text-gray-900 mb-4">
            Recursos Disponíveis
          </h3>
          <ul className="space-y-3 text-sm text-gray-600">
            <li className="flex items-start">
              <svg className="flex-shrink-0 h-5 w-5 text-green-500 mr-3" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
              </svg>
              <span>Envio automático de mensagens de confirmação de pedidos</span>
            </li>
            <li className="flex items-start">
              <svg className="flex-shrink-0 h-5 w-5 text-green-500 mr-3" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
              </svg>
              <span>Notificações de status de entrega aos clientes</span>
            </li>
            <li className="flex items-start">
              <svg className="flex-shrink-0 h-5 w-5 text-green-500 mr-3" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
              </svg>
              <span>Envio de cobranças e lembretes de pagamento</span>
            </li>
            <li className="flex items-start">
              <svg className="flex-shrink-0 h-5 w-5 text-green-500 mr-3" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
              </svg>
              <span>Suporte a mensagens de texto e mídia (imagens, documentos)</span>
            </li>
            <li className="flex items-start">
              <svg className="flex-shrink-0 h-5 w-5 text-green-500 mr-3" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
              </svg>
              <span>Proteção contra desconexão com sistema de reconnect automático</span>
            </li>
            <li className="flex items-start">
              <svg className="flex-shrink-0 h-5 w-5 text-green-500 mr-3" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
              </svg>
              <span>100% gratuito - usa biblioteca Baileys open-source</span>
            </li>
          </ul>
        </div>
      </div>

      {/* Technical Information */}
      <div className="bg-white shadow rounded-lg p-6">
        <h3 className="text-lg font-medium text-gray-900 mb-4">
          Informações Técnicas
        </h3>
        <dl className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div>
            <dt className="text-sm font-medium text-gray-500">Backend API</dt>
            <dd className="mt-1 text-sm text-gray-900 font-mono">
              {process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'}
            </dd>
          </div>
          <div>
            <dt className="text-sm font-medium text-gray-500">Tenant ID Atual</dt>
            <dd className="mt-1 text-sm text-gray-900 font-mono break-all">
              {tenantId}
            </dd>
          </div>
          <div>
            <dt className="text-sm font-medium text-gray-500">Versão do Sistema</dt>
            <dd className="mt-1 text-sm text-gray-900">
              OrderZap v2.0 - WhatsApp Integration
            </dd>
          </div>
        </dl>
      </div>
    </div>
  )
}
