// swift-tools-version: 6.0
import PackageDescription

// A tiny native iPhone shell around the Navi web app, built with xtool (no Mac, no Xcode project).
// The web app is copied into Sources/Navi/web by `npm run xtool:sync` before building.
let package = Package(
    name: "Navi",
    platforms: [.iOS(.v17)],
    products: [
        .library(name: "Navi", targets: ["Navi"]),
    ],
    targets: [
        .target(
            name: "Navi",
            resources: [.copy("web")],
            swiftSettings: [.swiftLanguageMode(.v5)]
        ),
    ]
)
