import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';

// Ranges based on https://en.wikipedia.org/wiki/Private_network
const privateIpRanges = [
  '10.0.0.0/8',
  '172.16.0.0/12',
  '192.168.0.0/16',
  '127.0.0.0/8', // loopback
  '::1/128', // IPv6 loopback
  'fc00::/7', // IPv6 unique local addresses
];

function ipToBigInt(ip: string): bigint {
  if (isIP(ip) === 4) {
    return ip.split('.').reduce((acc, octet) => (acc << 8n) + BigInt(parseInt(octet, 10)), 0n);
  } else if (isIP(ip) === 6) {
    const parts = ip.split(':').map(part => part.padStart(4, '0'));
    return BigInt('0x' + parts.join(''));
  }
  throw new Error('Invalid IP address');
}

function cidrToRange(cidr: string): [bigint, bigint] {
  const [range, bitsStr] = cidr.split('/');
  const bits = BigInt(parseInt(bitsStr, 10));
  const isIPv4 = isIP(range) === 4;
  const totalBits = isIPv4 ? 32n : 128n;
  const start = ipToBigInt(range);
  const end = start + (1n << (totalBits - bits)) - 1n;
  return [start, end];
}

const privateIpBigIntRanges = privateIpRanges.map(cidrToRange);

export async function isSafeUrl(url: string): Promise<boolean> {
  try {
    const { hostname } = new URL(url);
    const { address } = await lookup(hostname);
    const ipBigInt = ipToBigInt(address);

    for (const [start, end] of privateIpBigIntRanges) {
      if (ipBigInt >= start && ipBigInt <= end) {
        return false;
      }
    }

    return true;
  } catch (err) {
    // If we can't resolve the URL, we can't check it, so we'll consider it unsafe.
    return false;
  }
}
