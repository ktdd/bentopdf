import type { IncomingMessage, ServerResponse } from "http";
import http from "http";
import https from "https";
import type { Connect, Plugin } from "vite";
import { defineConfig } from "vitest/config";
// import basicSsl from '@vitejs/plugin-basic-ssl';
import tailwindcss from "@tailwindcss/vite";
import { createHash } from "crypto";
import fs from "fs";
import { resolve } from "path";
import handlebars from "vite-plugin-handlebars";
import { nodePolyfills } from "vite-plugin-node-polyfills";

function engineVersion(): string {
    try {
        const dir = resolve(__dirname, "node_modules/bentopdf-pdfium");
        const h = createHash("sha256");
        for (const f of ["editcore.js", "editcore.wasm"]) {
            h.update(fs.readFileSync(resolve(dir, f)));
        }
        return h.digest("hex").slice(0, 12);
    } catch {
        return "dev";
    }
}

function loadPages(): Set<string> {
    const pagesDir = resolve(__dirname, "src/pages");
    const pages = new Set<string>();

    if (fs.existsSync(pagesDir)) {
        for (const file of fs.readdirSync(pagesDir)) {
            if (file.endsWith(".html")) {
                pages.add(file.replace(".html", ""));
            }
        }
    }

    const rootPages = [
        "index",
        "about",
        "contact",
        "faq",
        "privacy",
        "terms",
        "licensing",
        "kura",
        "hyper-compress",
        "advertise",
        "404",
        "pdf-converter",
        "pdf-editor",
        "pdf-security",
        "pdf-merge-split",
    ];
    rootPages.forEach((p) => pages.add(p));

    return pages;
}

const PAGES = loadPages();

function getBasePath(): string {
    return (process.env.BASE_URL || "/").replace(/\/$/, "");
}

function createPageMiddleware(isDev: boolean): Connect.NextHandleFunction {
    return (req: IncomingMessage, res: ServerResponse, next: Connect.NextFunction): void => {
        if (!req.url) return next();

        const basePath = getBasePath();
        const [fullPathname, queryString] = req.url.split("?");

        let pathname = fullPathname;
        if (basePath && basePath !== "/" && pathname.startsWith(basePath)) {
            pathname = pathname.slice(basePath.length) || "/";
        }

        if (!pathname.startsWith("/")) {
            pathname = "/" + pathname;
        }

        if (isDev && pathname.endsWith(".html") && !pathname.startsWith("/src/")) {
            const pageName = pathname.slice(1).replace(".html", "");
            if (PAGES.has(pageName)) {
                const srcPath = resolve(__dirname, "src/pages", `${pageName}.html`);
                if (fs.existsSync(srcPath)) {
                    req.url = `/src/pages/${pageName}.html` + (queryString ? `?${queryString}` : "");
                    return next();
                }
            }
        }

        if (pathname === "/blog" || pathname === "/blog/") {
            req.url = "/blog/index.html" + (queryString ? `?${queryString}` : "");
            return next();
        }

        const blogMatch = pathname.match(/^\/blog\/([a-z0-9-]+)\/?$/);
        if (blogMatch) {
            req.url = `/blog/${blogMatch[1]}.html` + (queryString ? `?${queryString}` : "");
            return next();
        }

        next();
    };
}

function buildCorsProxyAllowedHosts(): Set<string> {
    const hosts = new Set<string>([
        "cdn.jsdelivr.net",
        "fonts.googleapis.com",
        "fonts.gstatic.com",
        "bentopdf-cors-proxy.bentopdf.workers.dev",
        "timestamp.digicert.com",
        "timestamp.sectigo.com",
        "ts.ssl.com",
        "freetsa.org",
        "tsa.mesign.com",
    ]);

    const envHostSources = [
        process.env.VITE_CORS_PROXY_URL,
        process.env.VITE_WASM_PYMUPDF_URL,
        process.env.VITE_WASM_GS_URL,
        process.env.VITE_WASM_CPDF_URL,
    ];
    for (const raw of envHostSources) {
        if (!raw) continue;
        try {
            hosts.add(new URL(raw).hostname);
        } catch {
            console.warn(`[vite] Ignoring malformed VITE_* URL in dev CORS proxy allowlist: ${raw}`);
        }
    }

    const extra = process.env.VITE_DEV_CORS_PROXY_EXTRA_HOSTS;
    if (extra) {
        for (const host of extra.split(",").map((s) => s.trim())) {
            if (host) hosts.add(host);
        }
    }

    return hosts;
}

const CORS_PROXY_ALLOWED_HOSTS = buildCorsProxyAllowedHosts();

function createCorsProxyMiddleware(): Connect.NextHandleFunction {
    return (req: IncomingMessage, res: ServerResponse, next: Connect.NextFunction): void => {
        if (!req.url?.startsWith("/cors-proxy")) return next();

        if (req.method === "OPTIONS") {
            res.setHeader("Access-Control-Allow-Origin", req.headers.origin || "*");
            res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
            res.setHeader("Access-Control-Allow-Headers", "Content-Type");
            res.statusCode = 204;
            res.end();
            return;
        }

        const parsed = new URL(req.url, "http://localhost");
        const targetUrl = parsed.searchParams.get("url");
        if (!targetUrl) {
            res.statusCode = 400;
            res.end("Missing url parameter");
            return;
        }

        let targetHost: string;
        let targetProtocol: string;
        try {
            const parsedTarget = new URL(targetUrl);
            targetHost = parsedTarget.hostname;
            targetProtocol = parsedTarget.protocol;
        } catch {
            res.statusCode = 400;
            res.end("Invalid url parameter");
            return;
        }

        if (targetProtocol !== "https:" && targetProtocol !== "http:") {
            res.statusCode = 400;
            res.end("Unsupported protocol");
            return;
        }

        if (!CORS_PROXY_ALLOWED_HOSTS.has(targetHost)) {
            console.warn(`[CORS Proxy] Blocked disallowed host: ${targetHost}`);
            res.statusCode = 403;
            res.end(`Host not allowed: ${targetHost}`);
            return;
        }

        console.log(`[CORS Proxy] ${req.method} ${targetUrl}`);

        const bodyChunks: Buffer[] = [];
        req.on("data", (chunk: Buffer) => bodyChunks.push(chunk));
        req.on("end", () => {
            const body = Buffer.concat(bodyChunks);
            const target = new URL(targetUrl);
            const transport = target.protocol === "https:" ? https : http;

            const headers: Record<string, string> = {};
            if (req.headers["content-type"]) {
                headers["Content-Type"] = req.headers["content-type"] as string;
            }
            if (body.length > 0) {
                headers["Content-Length"] = String(body.length);
            }

            const proxyReq = transport.request(targetUrl, { method: req.method || "GET", headers }, (proxyRes) => {
                console.log(`[CORS Proxy] Response: ${proxyRes.statusCode} from ${targetUrl}`);
                res.setHeader("Access-Control-Allow-Origin", req.headers.origin || "*");
                res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
                res.setHeader("Access-Control-Allow-Headers", "Content-Type");
                res.statusCode = proxyRes.statusCode || 200;
                proxyRes.pipe(res);
            });

            proxyReq.on("error", (err) => {
                const msg = String(err.message).replace(/[\r\n]+/g, " ");
                console.error("[CORS Proxy] Error:", msg);
                res.statusCode = 502;
                res.end(`Proxy error: ${msg}`);
            });

            if (body.length > 0) {
                proxyReq.write(body);
            }
            proxyReq.end();
        });
    };
}

function pageRouterPlugin(): Plugin {
    return {
        name: "page-router",
        configureServer(server) {
            server.middlewares.use(createCorsProxyMiddleware());
            server.middlewares.use(createPageMiddleware(true));
        },
        configurePreviewServer(server) {
            server.middlewares.use(createCorsProxyMiddleware());
            server.middlewares.use(createPageMiddleware(false));
        },
    };
}



function flattenPagesPlugin(): Plugin {
    return {
        name: "flatten-pages",
        enforce: "post",
        writeBundle(options, bundle) {
            const outDir = options.dir;
            if (!outDir) return;

            const moves: Array<{ from: string; to: string }> = [];

            for (const fileName of Object.keys(bundle)) {
                if (fileName.startsWith("src/pages/") && fileName.endsWith(".html")) {
                    moves.push({
                        from: fileName,
                        to: fileName.replace("src/pages/", ""),
                    });
                }
            }

            if (process.env.SIMPLE_MODE === "true" && bundle["simple-index.html"]) {
                moves.push({ from: "simple-index.html", to: "index.html" });
            }

            for (const { from, to } of moves) {
                const oldPath = resolve(outDir, from);
                const newPath = resolve(outDir, to);
                if (!fs.existsSync(oldPath)) continue;
                fs.mkdirSync(resolve(newPath, ".."), { recursive: true });
                if (fs.existsSync(newPath)) fs.rmSync(newPath, { force: true });
                fs.renameSync(oldPath, newPath);
            }

            const pagesDir = resolve(outDir, "src/pages");
            if (fs.existsSync(pagesDir) && fs.readdirSync(pagesDir).length === 0) {
                fs.rmdirSync(pagesDir);
            }
            const srcDir = resolve(outDir, "src");
            if (fs.existsSync(srcDir) && fs.readdirSync(srcDir).length === 0) {
                fs.rmdirSync(srcDir);
            }
        },
    };
}

function swPrecachePlugin(): Plugin {
    const workerAssetPattern = /^assets\/pdf\.worker(\.min)?-[\w-]+\.m?js$/;
    const placeholderPattern = /const PRECACHE_ASSETS = \[[\s\S]*?\];/;

    return {
        name: "sw-precache",
        apply: "build",
        enforce: "post",
        writeBundle(options, bundle) {
            const outDir = options.dir;
            if (!outDir) return;

            const workerAssets = Object.keys(bundle)
                .filter((fileName) => workerAssetPattern.test(fileName))
                .sort();

            if (workerAssets.length === 0) {
                throw new Error(
                    "[sw-precache] no PDF.js worker asset found in bundle; service worker would precache nothing",
                );
            }

            const swPath = resolve(outDir, "sw.js");
            if (!fs.existsSync(swPath)) {
                throw new Error(`[sw-precache] ${swPath} not found in build output`);
            }

            const source = fs.readFileSync(swPath, "utf8");
            if (!placeholderPattern.test(source)) {
                throw new Error('[sw-precache] could not find "const PRECACHE_ASSETS = [...]" in sw.js');
            }

            const list = workerAssets.map((asset) => `  '${asset}',`).join("\n");
            fs.writeFileSync(swPath, source.replace(placeholderPattern, `const PRECACHE_ASSETS = [\n${list}\n];`));

            console.log(`[sw-precache] precaching ${workerAssets.length} asset(s): ${workerAssets.join(", ")}`);
        },
    };
}

function rewriteHtmlPathsPlugin(): Plugin {
    const baseUrl = process.env.BASE_URL || "/";
    const normalizedBase = baseUrl.replace(/\/?$/, "/");

    const escapedBase = normalizedBase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

    return {
        name: "rewrite-html-paths",
        enforce: "post",
        writeBundle(options, bundle) {
            if (normalizedBase === "/") return;
            const outDir = options.dir;
            if (!outDir) return;

            const hrefRegex = new RegExp(`href="\\/(?!${escapedBase.slice(1)}|test\\/|http|\\/\\/)`, "g");
            const srcRegex = new RegExp(`src="\\/(?!${escapedBase.slice(1)}|test\\/|http|\\/\\/)`, "g");
            const contentRegex = new RegExp(`content="\\/(?!${escapedBase.slice(1)}|test\\/|http|\\/\\/)`, "g");

            for (const fileName of Object.keys(bundle)) {
                if (!fileName.endsWith(".html")) continue;
                const diskPath = [
                    resolve(outDir, fileName),
                    resolve(outDir, fileName.replace(/^src\/pages\//, "")),
                ].find((candidate) => fs.existsSync(candidate));
                if (!diskPath) continue;
                const source = fs.readFileSync(diskPath, "utf8");
                const updated = source
                    .replace(hrefRegex, `href="${normalizedBase}`)
                    .replaceAll(`href="${normalizedBase}"`, `href="${normalizedBase.slice(0, -1)}"`)
                    .replace(srcRegex, `src="${normalizedBase}`)
                    .replace(contentRegex, `content="${normalizedBase}`);
                if (updated !== source) {
                    fs.writeFileSync(diskPath, updated);
                }
            }
        },
    };
}

export default defineConfig(({ command }) => {
    const USE_CDN = process.env.VITE_USE_CDN === "true";
    const baseUrl = (process.env.BASE_URL || "/").replace(/\/?$/, "/");
    const docsUrl =
        baseUrl === "/" && (command === "serve" || process.env.INCLUDE_DOCS === "true")
            ? "/docs/"
            : "https://www.bentopdf.com/docs";
    const showAds =
        command === "serve" ||
        ["bentopdf.com", "www.bentopdf.com"].includes(process.env.VERCEL_PROJECT_PRODUCTION_URL ?? "");

    if (USE_CDN) {
        console.log("[Vite] Using CDN for WASM files (with local fallback)");
    } else {
        console.log("[Vite] Using local WASM files only");
    }

    return {
        base: (process.env.BASE_URL || "/").replace(/\/?$/, "/"),
        worker: {
            format: "es" as const,
        },
        plugins: [
            // basicSsl(),
            handlebars({
                partialDirectory: resolve(__dirname, "src/partials"),
                context: {
                    baseUrl: (process.env.BASE_URL || "/").replace(/\/?$/, "/"),
                    docsUrl,
                    simpleMode: process.env.SIMPLE_MODE === "true",
                    brandName: process.env.VITE_BRAND_NAME || "",
                    brandLogo: process.env.VITE_BRAND_LOGO || "",
                    footerText: process.env.VITE_FOOTER_TEXT || "",
                    appVersion: process.env.npm_package_version || "Unknown",
                    showAds,
                },
            }),
            pageRouterPlugin(),
            flattenPagesPlugin(),
            rewriteHtmlPathsPlugin(),
            swPrecachePlugin(),
            tailwindcss(),
            nodePolyfills({
                include: ["buffer", "stream", "util", "zlib", "process"],
                globals: {
                    Buffer: true,
                    global: false,
                    process: true,
                },
            }),
        ],
        define: {
            __BRAND_NAME__: JSON.stringify(process.env.VITE_BRAND_NAME || ""),
            __DISABLED_TOOLS__: JSON.stringify(
                (process.env.DISABLE_TOOLS || "")
                    .split(",")
                    .map((s) => s.trim())
                    .filter(Boolean),
            ),
            __ENGINE_VERSION__: JSON.stringify(engineVersion()),
        },
        resolve: {
            alias: {
                "@/types": resolve(__dirname, "src/js/types/index.ts"),
                "@": resolve(__dirname, "src"),
                stream: "stream-browserify",
                zlib: "browserify-zlib",
            },
        },
        optimizeDeps: {
            include: ["pdfkit", "blob-stream"],
            exclude: ["coherentpdf", "wasm-vips", "bentopdf-pdfium", "hyper-compress-wasm"],
        },
        server: {
            host: process.env.VITE_DEV_HOST || "localhost",
            proxy: {
                "/docs": {
                    target: "http://localhost:5174",
                    ws: true,
                    configure: (proxy) => {
                        proxy.on("error", (_error, _req, res) => {
                            if (!("writeHead" in res) || res.headersSent) return;
                            res.writeHead(502, { "Content-Type": "text/plain" });
                            res.end("The docs dev server is not running. Start it with: npm run docs:dev");
                        });
                    },
                },
            },
            watch: {
                ignored: ["!**/node_modules/bentopdf-pdfium/**"],
            },
            headers: {
                "Cross-Origin-Opener-Policy": "same-origin",
                "Cross-Origin-Embedder-Policy": "require-corp",
            },
        },
        preview: {
            headers: {
                "Cross-Origin-Opener-Policy": "same-origin",
                "Cross-Origin-Embedder-Policy": "require-corp",
            },
        },
        build: {
            rollupOptions: {
                input: {
                    main:
                        process.env.SIMPLE_MODE === "true"
                            ? resolve(__dirname, "simple-index.html")
                            : resolve(__dirname, "index.html"),
                    about: resolve(__dirname, "about.html"),
                    contact: resolve(__dirname, "contact.html"),
                    faq: resolve(__dirname, "faq.html"),
                    privacy: resolve(__dirname, "privacy.html"),
                    terms: resolve(__dirname, "terms.html"),
                    licensing: resolve(__dirname, "licensing.html"),
                    kura: resolve(__dirname, "kura.html"),
                    "hyper-compress": resolve(__dirname, "hyper-compress.html"),
                    ...(showAds ? { advertise: resolve(__dirname, "advertise.html") } : {}),
                    ...Object.fromEntries(
                        fs
                            .readdirSync(resolve(__dirname, "blog"))
                            .filter((f) => f.endsWith(".html"))
                            .map((f) => [`blog-${f.replace(".html", "")}`, resolve(__dirname, "blog", f)]),
                    ),
                    "404": resolve(__dirname, "404.html"),
                    // Category Hub Pages
                    "pdf-converter": resolve(__dirname, "pdf-converter.html"),
                    "pdf-editor": resolve(__dirname, "pdf-editor.html"),
                    "pdf-security": resolve(__dirname, "pdf-security.html"),
                    "pdf-merge-split": resolve(__dirname, "pdf-merge-split.html"),
                    // Tool Pages
                    "json-to-pdf": resolve(__dirname, "src/pages/json-to-pdf.html"),
                    "repair-pdf": resolve(__dirname, "src/pages/repair-pdf.html"),
                    "merge-pdf": resolve(__dirname, "src/pages/merge-pdf.html"),
                    "split-pdf": resolve(__dirname, "src/pages/split-pdf.html"),
                    "compress-pdf": resolve(__dirname, "src/pages/compress-pdf.html"),
                    "edit-pdf-text": resolve(__dirname, "src/pages/edit-pdf-text.html"),
                    "crop-pdf": resolve(__dirname, "src/pages/crop-pdf.html"),
                    "extract-pages": resolve(__dirname, "src/pages/extract-pages.html"),
                    "delete-pages": resolve(__dirname, "src/pages/delete-pages.html"),
                    "page-numbers": resolve(__dirname, "src/pages/page-numbers.html"),
                    "header-footer": resolve(__dirname, "src/pages/header-footer.html"),
                    "image-to-pdf": resolve(__dirname, "src/pages/image-to-pdf.html"),
                    "rotate-pdf": resolve(__dirname, "src/pages/rotate-pdf.html"),
                    "n-up-pdf": resolve(__dirname, "src/pages/n-up-pdf.html"),
                    "combine-single-page": resolve(__dirname, "src/pages/combine-single-page.html"),
                    "edit-metadata": resolve(__dirname, "src/pages/edit-metadata.html"),
                    "unlock-pdf": resolve(__dirname, "src/pages/unlock-pdf.html"),
                    "flatten-pdf": resolve(__dirname, "src/pages/flatten-pdf.html"),
                    "protect-pdf": resolve(__dirname, "src/pages/protect-pdf.html"),
                    "sanitize-pdf": resolve(__dirname, "src/pages/sanitize-pdf.html"),
                    "txt-to-pdf": resolve(__dirname, "src/pages/txt-to-pdf.html"),
                    "markdown-to-pdf": resolve(__dirname, "src/pages/markdown-to-pdf.html"),
                    "rasterize-pdf": resolve(__dirname, "src/pages/rasterize-pdf.html"),
                    "csv-to-pdf": resolve(__dirname, "src/pages/csv-to-pdf.html"),
                    "pdf-booklet": resolve(__dirname, "src/pages/pdf-booklet.html"),
                },
                output: {
                    assetFileNames: (assetInfo) => {
                        const name = assetInfo.names?.[0] ?? "";
                        if (name.endsWith(".mjs")) {
                            return "assets/[name]-[hash].js";
                        }
                        return "assets/[name]-[hash][extname]";
                    },
                },
            },
        },
        test: {
            globals: true,
            environment: "jsdom",
            setupFiles: "./src/tests/setup.ts",
            coverage: {
                provider: "v8" as const,
                reporter: ["text", "json", "html"],
                exclude: ["node_modules/", "src/tests/", "*.config.ts", "**/*.d.ts", "dist/"],
            },
        },
    };
});
