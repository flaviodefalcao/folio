package org.folio.reader;
import android.app.*;
import android.content.Intent;
import android.os.*;
public class AudioService extends Service {
    static volatile Runnable stopAudio;
    private static volatile AudioService running;
    static void schedule(long deadline){AudioService instance=running;if(instance!=null)instance.handler.post(()->instance.arm(deadline));}
    private void arm(long deadline){handler.removeCallbacksAndMessages(null);if(deadline>0)handler.postDelayed(()->{if(stopAudio!=null)stopAudio.run();stopSelf();},Math.max(0,deadline-System.currentTimeMillis()));}
    private final Handler handler = new Handler(Looper.getMainLooper());
    private PowerManager.WakeLock wake;
    @Override public void onCreate() {
        super.onCreate(); running=this;
        if(Build.VERSION.SDK_INT>=26)getSystemService(NotificationManager.class).createNotificationChannel(new NotificationChannel("folio_audio", "Leitura em áudio", NotificationManager.IMPORTANCE_LOW));
        wake=((PowerManager)getSystemService(POWER_SERVICE)).newWakeLock(PowerManager.PARTIAL_WAKE_LOCK,"folio:audio");wake.acquire(4*60*60*1000L);
    }
    @Override public int onStartCommand(Intent intent,int flags,int id) {
        if(intent!=null && "stop".equals(intent.getAction())) { if(stopAudio!=null)stopAudio.run();stopSelf();return START_NOT_STICKY; }
        PendingIntent open=PendingIntent.getActivity(this,0,new Intent(this,MainActivity.class),PendingIntent.FLAG_IMMUTABLE|PendingIntent.FLAG_UPDATE_CURRENT);
        PendingIntent stop=PendingIntent.getService(this,1,new Intent(this,AudioService.class).setAction("stop"),PendingIntent.FLAG_IMMUTABLE|PendingIntent.FLAG_UPDATE_CURRENT);
        Notification.Builder builder=Build.VERSION.SDK_INT>=26?new Notification.Builder(this,"folio_audio"):new Notification.Builder(this);
        startForeground(21,builder.setSmallIcon(android.R.drawable.ic_media_play).setContentTitle("Folio · ouvindo livro").setContentText("Toque para voltar à leitura").setContentIntent(open).setOngoing(true).addAction(new Notification.Action.Builder(android.R.drawable.ic_media_pause,"Parar",stop).build()).build());
        long deadline=intent==null?0:intent.getLongExtra("sleepUntil",0);
        arm(deadline);
        return START_NOT_STICKY;
    }
    @Override public void onDestroy(){running=null;handler.removeCallbacksAndMessages(null);if(wake!=null&&wake.isHeld())wake.release();super.onDestroy();}
    @Override public IBinder onBind(Intent intent){return null;}
}
