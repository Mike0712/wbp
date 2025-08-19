import { NextApiRequest, NextApiResponse } from 'next';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const { account } = req.query;

  if (!account) {
    return res.status(400).json({ error: 'Missing account param' });
  }

  const proxyUrl = `http://192.168.200.234:4000/view/${account}`;
  res.json({ url: proxyUrl });
}