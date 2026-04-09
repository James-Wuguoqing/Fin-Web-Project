import { NextResponse } from "next/server";
import { getCachedNewsFeedState } from "../../../lib/market-data";

export async function GET() {
  const data = await getCachedNewsFeedState();
  return NextResponse.json(data);
}
