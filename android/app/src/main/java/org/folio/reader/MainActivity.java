package org.folio.reader;

import com.getcapacitor.BridgeActivity;
import android.os.Bundle;
import android.os.Build;
import android.graphics.Color;
import android.graphics.Rect;
import android.view.View;
import androidx.core.graphics.Insets;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;
import androidx.core.view.WindowInsetsControllerCompat;

public class MainActivity extends BridgeActivity {
    private WindowInsetsCompat currentInsets;

    private void applyContentInsets(View content, WindowInsetsCompat windowInsets) {
        Insets bars = windowInsets.getInsets(WindowInsetsCompat.Type.systemBars() | WindowInsetsCompat.Type.displayCutout());
        Insets keyboard = windowInsets.getInsets(WindowInsetsCompat.Type.ime());
        int bottomPadding = bars.bottom;
        if (windowInsets.isVisible(WindowInsetsCompat.Type.ime()) && keyboard.bottom > 0) {
            int[] position = new int[2];
            content.getLocationOnScreen(position);
            // An ancestor can already clip this view for adjustResize while
            // its measured height still includes the hidden area.
            Rect localVisible = new Rect();
            int visibleBottom = content.getLocalVisibleRect(localVisible) ? localVisible.bottom : content.getHeight();
            int keyboardTop;
            if (Build.VERSION.SDK_INT >= 30) {
                // Window metrics include the IME even when adjustResize already
                // shortened this view. Reserve only the remaining overlap.
                keyboardTop = getWindowManager().getCurrentWindowMetrics().getBounds().bottom - keyboard.bottom;
            } else {
                Rect visible = new Rect();
                content.getWindowVisibleDisplayFrame(visible);
                keyboardTop = visible.bottom;
            }
            bottomPadding = Math.min(keyboard.bottom, Math.max(0, position[1] + visibleBottom - keyboardTop));
        }
        if (content.getPaddingLeft() != bars.left || content.getPaddingTop() != bars.top || content.getPaddingRight() != bars.right || content.getPaddingBottom() != bottomPadding) {
            content.setPadding(bars.left, bars.top, bars.right, bottomPadding);
        }
    }

    @Override public void onCreate(Bundle savedInstanceState) {
        registerPlugin(FolioPlugin.class);
        super.onCreate(savedInstanceState);
        WindowCompat.setDecorFitsSystemWindows(getWindow(), false);
        View content = findViewById(android.R.id.content);
        content.setBackgroundColor(Color.rgb(245, 244, 239));
        ViewCompat.setOnApplyWindowInsetsListener(content, (view, windowInsets) -> {
            currentInsets = windowInsets;
            applyContentInsets(view, windowInsets);
            // The parent already reserves these areas. Still dispatch a zeroed
            // update so WebView clears stale keyboard/viewport insets on resize.
            return new WindowInsetsCompat.Builder(windowInsets)
                .setInsets(WindowInsetsCompat.Type.systemBars() | WindowInsetsCompat.Type.displayCutout() | WindowInsetsCompat.Type.ime(), Insets.NONE)
                .build();
        });
        content.getViewTreeObserver().addOnGlobalLayoutListener(() -> {
            if (currentInsets != null) applyContentInsets(content, currentInsets);
        });
        WindowInsetsControllerCompat controller = new WindowInsetsControllerCompat(getWindow(), content);
        controller.setAppearanceLightStatusBars(true);
        controller.setAppearanceLightNavigationBars(true);
        ViewCompat.requestApplyInsets(content);
    }
}
