import SwiftUI
import WebKit

/// Hosts the bundled web app in a WKWebView. Everything is served from the app bundle through the
/// navi:// scheme, so the app works offline. Network use is limited to the map, routing and search
/// services the web app itself calls over HTTPS.
struct ShellView: UIViewRepresentable {
    func makeUIView(context: Context) -> WKWebView {
        let config = WKWebViewConfiguration()
        config.allowsInlineMediaPlayback = true
        config.mediaTypesRequiringUserActionForPlayback = []
        config.setURLSchemeHandler(BundleSchemeHandler(), forURLScheme: "navi")

        let view = WKWebView(frame: .zero, configuration: config)
        view.isOpaque = false
        view.backgroundColor = UIColor(red: 0.043, green: 0.051, blue: 0.063, alpha: 1)
        view.scrollView.backgroundColor = view.backgroundColor
        view.scrollView.bounces = false
        view.scrollView.contentInsetAdjustmentBehavior = .never
        view.allowsBackForwardNavigationGestures = false
        view.load(URLRequest(url: URL(string: "navi://app/index.html")!))
        return view
    }

    func updateUIView(_ uiView: WKWebView, context: Context) {}
}
