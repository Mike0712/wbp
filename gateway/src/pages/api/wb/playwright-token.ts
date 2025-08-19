import type { NextApiRequest, NextApiResponse } from 'next';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const token = await fetch('http://playwright:4000/token');

  if (token) {
    res.status(200).json({ token });
  } else {
    res.status(500).json({ error: 'Failed to get token' });
  }
}
