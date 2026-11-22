import SwiftUI

@main
struct NaviApp: App {
    var body: some Scene {
        WindowGroup {
            ShellView()
                .ignoresSafeArea()
                .background(Color(red: 0.043, green: 0.051, blue: 0.063))
                .preferredColorScheme(.dark)
        }
    }
}
