import { NextResponse } from 'next/server'

export async function GET() {
  return NextResponse.json({
    status: 'healthy',
    service: 'OrderZap Frontend',
    version: '2.0.0',
    timestamp: new Date().toISOString(),
  })
}
