// swift-tools-version: 5.9
import PackageDescription

// GenCare's own native pieces for iPhone, as one Swift package the app links:
//   NotifyBridge   — push notifications (OneSignal)
//   CalendarBridge — the phone's calendars, read and write (EventKit)
//   RecorderBridge — the Record Notes recorder (AVAudioRecorder, keeps going in the background)
//   BillingBridge  — the Family plan subscription (RevenueCat / StoreKit)
// Same plugin names and methods as the Android app, so the web app does not
// care which phone it is on.
let package = Package(
    name: "GenCareNative",
    platforms: [.iOS(.v15)],
    products: [
        .library(name: "GenCareNative", targets: ["GenCareNative"])
    ],
    dependencies: [
        .package(url: "https://github.com/ionic-team/capacitor-swift-pm.git", exact: "8.5.3"),
        .package(url: "https://github.com/OneSignal/OneSignal-XCFramework.git", from: "5.2.0"),
        .package(url: "https://github.com/RevenueCat/purchases-ios-spm.git", from: "5.0.0")
    ],
    targets: [
        .target(
            name: "GenCareNative",
            dependencies: [
                .product(name: "Capacitor", package: "capacitor-swift-pm"),
                .product(name: "OneSignalFramework", package: "OneSignal-XCFramework"),
                .product(name: "RevenueCat", package: "purchases-ios-spm")
            ],
            path: "Sources/GenCareNative"
        )
    ]
)
