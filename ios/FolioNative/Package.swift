// swift-tools-version: 5.9
import PackageDescription
let package = Package(name: "FolioNative", platforms: [.iOS(.v15)], products: [.library(name: "FolioNative", targets: ["FolioNative"])], dependencies: [
    .package(url: "https://github.com/ionic-team/capacitor-swift-pm.git", exact: "8.5.3"),
    .package(url: "https://github.com/scinfu/SwiftSoup.git", exact: "2.14.2")
], targets: [.target(name: "FolioNative", dependencies: [.product(name: "Capacitor", package: "capacitor-swift-pm"), .product(name: "SwiftSoup", package: "SwiftSoup")]), .testTarget(name: "FolioNativeTests", dependencies: ["FolioNative"])])
