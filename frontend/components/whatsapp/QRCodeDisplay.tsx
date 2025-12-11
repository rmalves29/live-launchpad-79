'use client'

import { useEffect, useState } from 'react'
import Image from 'next/image'

interface QRCodeDisplayProps {
  tenantId: string
}

export default function QRCodeDisplay({ tenantId }: QRCodeDisplayProps) {
  const [qrCode, setQrCode] = useState<string | null>(null)
  const [status, setStatus] = useState<'loading' | 'qr_ready' | 'connected' | 'error'>('loading')
  const [error, setError] = useState<string | null>(null)
  const [isPolling, setIsPolling] = useState(false)

  const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'

  // Função para iniciar conexão
  const startConnection = async () => {
    try {
      setStatus('loading')
      setError(null)

      const response = await fetch(`${apiUrl}/start/${tenantId}`, {
        method: 'POST',
      })

      if (!response.ok) {
        throw new Error(`Erro HTTP: ${response.status}`)
      }

      const data = await response.json()
      
      if (data.ok && data.qrCode) {
        setQrCode(data.qrCode)
        setStatus('qr_ready')
        setIsPolling(true)
      } else if (data.status === 'connected') {
        setStatus('connected')
      } else {
        throw new Error(data.error || 'Erro ao iniciar conexão')
      }
    } catch (err) {
      console.error('Erro ao iniciar conexão:', err)
      setError(err instanceof Error ? err.message : 'Erro desconhecido')
      setStatus('error')
    }
  }

  // Função para verificar status
  const checkStatus = async () => {
    try {
      const response = await fetch(`${apiUrl}/status/${tenantId}`)
      
      if (!response.ok) {
        console.error('Erro ao verificar status:', response.status)
        return
      }

      const data = await response.json()
      
      if (data.ok && data.status === 'connected') {
        setStatus('connected')
        setIsPolling(false)
        setQrCode(null)
      } else if (data.status === 'qr_ready' && data.qrCode) {
        setQrCode(data.qrCode)
        setStatus('qr_ready')
      }
    } catch (err) {
      console.error('Erro ao verificar status:', err)
    }
  }

  // Função para desconectar
  const disconnect = async () => {
    try {
      const response = await fetch(`${apiUrl}/disconnect/${tenantId}`, {
        method: 'POST',
      })

      if (!response.ok) {
        throw new Error(`Erro HTTP: ${response.status}`)
      }

      setStatus('loading')
      setQrCode(null)
      setIsPolling(false)
    } catch (err) {
      console.error('Erro ao desconectar:', err)
      setError(err instanceof Error ? err.message : 'Erro ao desconectar')
    }
  }

  // Polling para verificar status a cada 3 segundos
  useEffect(() => {
    let interval: NodeJS.Timeout | null = null

    if (isPolling) {
      interval = setInterval(() => {
        checkStatus()
      }, 3000)
    }

    return () => {
      if (interval) clearInterval(interval)
    }
  }, [isPolling, tenantId])

  return (
    <div className="bg-white shadow rounded-lg p-6">
      <div className="space-y-6">
        {/* Status Header */}
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-lg font-medium text-gray-900">
              Status da Conexão
            </h3>
            <p className="mt-1 text-sm text-gray-500">
              {status === 'loading' && 'Iniciando...'}
              {status === 'qr_ready' && 'Escaneie o QR Code'}
              {status === 'connected' && '✅ Conectado'}
              {status === 'error' && '❌ Erro na conexão'}
            </p>
          </div>
          
          {/* Status Badge */}
          <span
            className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-medium ${
              status === 'connected'
                ? 'bg-green-100 text-green-800'
                : status === 'qr_ready'
                ? 'bg-yellow-100 text-yellow-800'
                : status === 'error'
                ? 'bg-red-100 text-red-800'
                : 'bg-gray-100 text-gray-800'
            }`}
          >
            {status === 'connected' && '● Online'}
            {status === 'qr_ready' && '● Aguardando'}
            {status === 'error' && '● Erro'}
            {status === 'loading' && '● Carregando'}
          </span>
        </div>

        {/* QR Code Display */}
        {status === 'qr_ready' && qrCode && (
          <div className="flex flex-col items-center justify-center space-y-4">
            <div className="bg-white p-4 rounded-lg border-2 border-gray-200">
              <Image
                src={qrCode}
                alt="QR Code WhatsApp"
                width={300}
                height={300}
                unoptimized
                className="rounded"
              />
            </div>
            <div className="text-center">
              <p className="text-sm text-gray-600">
                Abra o WhatsApp no seu celular e escaneie este código
              </p>
              <p className="text-xs text-gray-500 mt-1">
                O código expira em alguns minutos
              </p>
            </div>
          </div>
        )}

        {/* Connected State */}
        {status === 'connected' && (
          <div className="flex flex-col items-center justify-center space-y-4 py-8">
            <div className="text-6xl">✅</div>
            <div className="text-center">
              <h4 className="text-lg font-medium text-gray-900">
                WhatsApp Conectado!
              </h4>
              <p className="text-sm text-gray-500 mt-1">
                Seu número está ativo e pronto para enviar mensagens
              </p>
            </div>
          </div>
        )}

        {/* Error State */}
        {status === 'error' && error && (
          <div className="rounded-md bg-red-50 p-4">
            <div className="flex">
              <div className="flex-shrink-0">
                <svg
                  className="h-5 w-5 text-red-400"
                  viewBox="0 0 20 20"
                  fill="currentColor"
                >
                  <path
                    fillRule="evenodd"
                    d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z"
                    clipRule="evenodd"
                  />
                </svg>
              </div>
              <div className="ml-3">
                <h3 className="text-sm font-medium text-red-800">
                  Erro ao conectar
                </h3>
                <div className="mt-2 text-sm text-red-700">
                  <p>{error}</p>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Action Buttons */}
        <div className="flex gap-3">
          {status !== 'connected' && (
            <button
              onClick={startConnection}
              disabled={status === 'loading'}
              className="flex-1 inline-flex justify-center items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-green-600 hover:bg-green-700 disabled:bg-gray-400 disabled:cursor-not-allowed"
            >
              {status === 'loading' ? 'Iniciando...' : 'Conectar WhatsApp'}
            </button>
          )}
          
          {status === 'connected' && (
            <button
              onClick={disconnect}
              className="flex-1 inline-flex justify-center items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-red-600 hover:bg-red-700"
            >
              Desconectar
            </button>
          )}

          {status === 'qr_ready' && (
            <button
              onClick={startConnection}
              className="inline-flex justify-center items-center px-4 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50"
            >
              Gerar Novo QR
            </button>
          )}
        </div>

        {/* Info */}
        <div className="rounded-md bg-blue-50 p-4">
          <div className="flex">
            <div className="flex-shrink-0">
              <svg
                className="h-5 w-5 text-blue-400"
                viewBox="0 0 20 20"
                fill="currentColor"
              >
                <path
                  fillRule="evenodd"
                  d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z"
                  clipRule="evenodd"
                />
              </svg>
            </div>
            <div className="ml-3 flex-1">
              <p className="text-sm text-blue-700">
                <strong>Tenant ID:</strong> {tenantId}
              </p>
              <p className="text-xs text-blue-600 mt-1">
                Use este ID para identificar sua conta nas integrações
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
