// pages/api/accounts.js
import { getAccounts } from '@/lib/accounts/getAccounts';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const accounts = await getAccounts();
    res.status(200).json({ success: true, data: accounts });
  } catch (error) {
    console.error('Failed to fetch accounts:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch accounts' });
  }
}