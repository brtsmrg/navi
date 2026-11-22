import Foundation
import WebKit

/// Serves files from the bundled `web` folder for URLs like navi://app/assets/index.js.
/// Only paths inside that folder can be read.
final class BundleSchemeHandler: NSObject, WKURLSchemeHandler {
    private let root: URL? = Bundle.module.resourceURL?.appendingPathComponent("web", isDirectory: true)

    private static let types: [String: String] = [
        "html": "text/html", "js": "text/javascript", "mjs": "text/javascript", "css": "text/css",
        "json": "application/json", "webmanifest": "application/manifest+json", "svg": "image/svg+xml",
        "png": "image/png", "woff2": "font/woff2", "woff": "font/woff", "ico": "image/x-icon",
    ]

    func webView(_ webView: WKWebView, start task: any WKURLSchemeTask) {
        guard let root, let url = task.request.url else { return fail(task, code: 404) }
        var path = url.path
        if path.isEmpty || path == "/" { path = "/index.html" }
        let file = root.appendingPathComponent(String(path.dropFirst())).standardizedFileURL
        guard file.path.hasPrefix(root.standardizedFileURL.path),
              let data = try? Data(contentsOf: file) else { return fail(task, code: 404) }

        let mime = Self.types[file.pathExtension.lowercased()] ?? "application/octet-stream"
        let headers = [
            "Content-Type": mime,
            "Content-Length": String(data.count),
            "Access-Control-Allow-Origin": "*",
            "Cache-Control": "no-cache",
        ]
        guard let response = HTTPURLResponse(url: url, statusCode: 200, httpVersion: "HTTP/1.1", headerFields: headers) else {
            return fail(task, code: 500)
        }
        task.didReceive(response)
        task.didReceive(data)
        task.didFinish()
    }

    func webView(_ webView: WKWebView, stop task: any WKURLSchemeTask) {}

    private func fail(_ task: any WKURLSchemeTask, code: Int) {
        task.didFailWithError(NSError(domain: NSURLErrorDomain, code: code == 404 ? NSURLErrorFileDoesNotExist : NSURLErrorUnknown))
    }
}
