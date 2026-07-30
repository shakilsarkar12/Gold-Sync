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
    // Do not send shopify tokens to frontend at all
    const { shopifyAccessToken, shopifyDynamicToken, goldApiKey, ...safeSettings } = settings;
    
    return NextResponse.json(safeSettings);
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
    const makingChargeChanged = currentSettings.makingChargePerGram !== payload.makingChargePerGram;

    // Remove sensitive keys from payload before saving if necessary
    const { shopifyAccessToken, shopifyDynamicToken, goldApiKey, ...settingsToSave } = payload;

    const updated = await saveSettings(settingsToSave);

    return NextResponse.json({
      success: true,
      message: 'Settings saved successfully',
      makingChargeChanged,
    });

    // Do not send shopify tokens to frontend at all
    const { shopifyAccessToken: _t1, shopifyDynamicToken: _t2, goldApiKey: _t3, ...safeSettings } = updated;
    
    return NextResponse.json({ success: true, settings: safeSettings, message: responseMessage });
  } catch (error) {
    return NextResponse.json(
      { error: error.message || 'Failed to save settings' },
      { status: 500 }
    );
  }
}
