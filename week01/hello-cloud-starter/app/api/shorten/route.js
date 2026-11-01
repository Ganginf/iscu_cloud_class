import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import {
  saveUrl,
  findShortCodeByOriginalUrl,
} from "../../../lib/db";

export const runtime = "nodejs";

const MAX_URL_LENGTH = 2048;

const ALPHABET =
  "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";

function createShortCode(originalUrl, length = 6) {
  const hex = createHash("sha256")
    .update(originalUrl)
    .digest("hex");

  let code = "";

  for (let i = 0; i < length; i++) {
    const value = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
    code += ALPHABET[value % ALPHABET.length];
  }

  return code;
}

export async function POST(request) {
  try {
    const body = await request.json().catch(() => null);

    const raw = body?.originalUrl;
    const originalUrl =
      typeof raw === "string" ? raw.trim() : "";

    if (!originalUrl) {
      return NextResponse.json(
        {
          error: {
            code: "MISSING_URL",
            message: "Original URL is required.",
          },
        },
        { status: 400 }
      );
    }

    if (originalUrl.length > MAX_URL_LENGTH) {
      return NextResponse.json(
        {
          error: {
            code: "URL_TOO_LONG",
            message: `URL must be ${MAX_URL_LENGTH} characters or fewer.`,
          },
        },
        { status: 400 }
      );
    }

    let parsedUrl;

    try {
      parsedUrl = new URL(originalUrl);
    } catch {
      return NextResponse.json(
        {
          error: {
            code: "INVALID_URL",
            message: "URL must start with http:// or https://.",
          },
        },
        { status: 400 }
      );
    }

    if (!["http:", "https:"].includes(parsedUrl.protocol)) {
      return NextResponse.json(
        {
          error: {
            code: "INVALID_URL",
            message: "URL must start with http:// or https://.",
          },
        },
        { status: 400 }
      );
    }

    const requestUrl = new URL(request.url);
    const baseUrl = requestUrl.origin;

    const serviceHostnames = new Set([
      requestUrl.hostname,
      "iscu-cloud-class-nine.vercel.app",
    ]);

    if (serviceHostnames.has(parsedUrl.hostname)) {
      return NextResponse.json(
        {
          error: {
            code: "SELF_URL_NOT_ALLOWED",
            message: "자기 서비스의 URL은 단축할 수 없습니다.",
          },
        },
        { status: 400 }
      );
    }

    const existingShortCode =
      await findShortCodeByOriginalUrl(originalUrl);

    if (existingShortCode) {
      return NextResponse.json(
        {
          shortCode: existingShortCode,
          shortUrl: `${baseUrl}/${existingShortCode}`,
          originalUrl,
        },
        { status: 200 }
      );
    }

    const shortCode = createShortCode(originalUrl);

    await saveUrl(shortCode, originalUrl);

    return NextResponse.json(
      {
        shortCode,
        shortUrl: `${baseUrl}/${shortCode}`,
        originalUrl,
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("URL 저장 오류:", error);

    return NextResponse.json(
      {
        error: {
          code: "INTERNAL_ERROR",
          message: "Failed to create short URL.",
        },
      },
      { status: 500 }
    );
  }
}