import { NextResponse } from 'next/server';
import { getSettings, saveSettings } from '@/lib/db';

// Mask helper to hide sensitive credentials from being exposed in plain text to the browser
const maskSecret = (value, visibleLength = 4) => {
  if (!value) return '';
  if (value.length <= visibleLength) return '••••••••';
  return value.slice(0, visibleLength) + '••••••••';
};

export async function GET() {
  try {
    const settings = await getSettings();
    const maskedSettings = {
      ...settings,
      shopifyAccessToken: maskSecret(settings.shopifyAccessToken, 6),
      goldApiKey: maskSecret(settings.goldApiKey, 4),
    };
    return NextResponse.json(maskedSettings);
  } catch (error) {
    return NextResponse.json(
      { error: error.message || 'Failed to fetch settings' },
      { status: 500 }
    );
  }
}

export async function POST(request) {
  try {
    const payload = await request.json();
    const currentSettings = await getSettings();

    // Preserve original secrets if submitted as masked placeholders
    if (payload.shopifyAccessToken && payload.shopifyAccessToken.includes('•')) {
      payload.shopifyAccessToken = currentSettings.shopifyAccessToken;
    }
    if (payload.goldApiKey && payload.goldApiKey.includes('•')) {
      payload.goldApiKey = currentSettings.goldApiKey;
    }

    const updated = await saveSettings(payload);
    const maskedSettings = {
      ...updated,
      shopifyAccessToken: maskSecret(updated.shopifyAccessToken, 6),
      goldApiKey: maskSecret(updated.goldApiKey, 4),
    };
    return NextResponse.json({ success: true, settings: maskedSettings });
  } catch (error) {
    return NextResponse.json(
      { error: error.message || 'Failed to save settings' },
      { status: 500 }
    );
  }
}
