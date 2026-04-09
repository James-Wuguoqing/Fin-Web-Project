import { NextResponse } from "next/server";
import { getCachedMarketsData } from "../../../lib/market-data";

export async function GET() {
  const data = await getCachedMarketsData();
  return NextResponse.json(data);
}
