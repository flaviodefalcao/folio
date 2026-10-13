package org.folio.reader;

import android.content.Context;
import android.media.*;
import android.os.*;
import com.k2fsa.sherpa.onnx.*;
import java.io.*;
import java.util.concurrent.*;
import java.util.concurrent.atomic.*;

/** Offline inference and playback; progress follows sentences with estimated within-sentence timing. */
final class NeuralNarrator {
    interface Events {void progress(int offset);void ended();void error();}
    private final Context context;
    private final NeuralVoiceModels models;
    private final Events events;
    private final Handler main=new Handler(Looper.getMainLooper());
    private final ExecutorService worker=Executors.newSingleThreadExecutor();
    private final AtomicInteger generation=new AtomicInteger();
    private MediaPlayer player;
    private CountDownLatch completion;
    private OfflineTts engine;
    private String engineId="";
    NeuralNarrator(Context context,NeuralVoiceModels models,Events events) {this.context=context;this.models=models;this.events=events;}
    void stop() {
        generation.incrementAndGet();
        main.post(() -> {if(player!=null){try{player.stop();}catch(Exception ignored){}player.release();player=null;}if(completion!=null){completion.countDown();completion=null;}});
    }
    void speak(NeuralVoiceModels.Model model,String text,float rate) {
        stop();int session=generation.get();
        worker.execute(() -> {
            File wav=new File(context.getCacheDir(),"neural-speech.wav");
            try {
                if(!engineId.equals(model.id) || engine==null) {
                    if(engine!=null)engine.release();engine=null;engineId="";
                    File folder=new File(models.folder(model),model.archive);
                    OfflineTtsVitsModelConfig vits=new OfflineTtsVitsModelConfig();
                    vits.setModel(models.modelFile(model).getAbsolutePath());
                    vits.setTokens(new File(folder,"tokens.txt").getAbsolutePath());
                    vits.setDataDir(new File(folder,"espeak-ng-data").getAbsolutePath());
                    OfflineTtsModelConfig modelConfig=new OfflineTtsModelConfig();modelConfig.setVits(vits);modelConfig.setNumThreads(2);
                    OfflineTtsConfig config=new OfflineTtsConfig();config.setModel(modelConfig);
                    engine=new OfflineTts(null,config);engineId=model.id;
                }
                for(int offset=0;offset<text.length() && generation.get()==session;) {
                    int end=chunkEnd(text,offset);String phrase=text.substring(offset,end);
                    if(phrase.trim().isEmpty()){offset=end;continue;}
                    GeneratedAudio audio=engine.generate(phrase,0,rate);
                    if(generation.get()!=session)break;
                    if(audio.getSamples().length==0 || !audio.save(wav.getAbsolutePath()))throw new IOException("Empty neural audio");
                    CountDownLatch latch=new CountDownLatch(1);AtomicBoolean failed=new AtomicBoolean();int start=offset;
                    main.post(() -> {
                        if(generation.get()!=session){latch.countDown();return;}
                        try {
                            player=new MediaPlayer();completion=latch;
                            player.setAudioAttributes(new AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_MEDIA).setContentType(AudioAttributes.CONTENT_TYPE_SPEECH).build());
                            player.setWakeMode(context,PowerManager.PARTIAL_WAKE_LOCK);
                            player.setDataSource(wav.getAbsolutePath());
                            player.setOnCompletionListener(mp->{mp.release();player=null;completion=null;latch.countDown();});
                            player.setOnErrorListener((mp,what,extra)->{failed.set(true);mp.release();player=null;completion=null;latch.countDown();return true;});
                            player.prepare();player.start();events.progress(start);tick(session,start,phrase.length(),player);
                        }catch(Exception e){failed.set(true);if(player!=null){player.release();player=null;}completion=null;latch.countDown();}
                    });
                    while(!latch.await(1,TimeUnit.SECONDS)) {if(generation.get()!=session)break;}
                    if(failed.get())throw new IOException("Neural playback failed");
                    offset=end;
                }
                if(generation.get()==session)main.post(() -> {if(generation.get()==session)events.ended();});
            }catch(Throwable e){if(generation.get()==session)main.post(() -> {if(generation.get()==session)events.error();});}
            finally {wav.delete();}
        });
    }
    private void tick(int session,int start,int length,MediaPlayer expected) {
        if(generation.get()!=session || player==null || player!=expected)return;
        try {int duration=player.getDuration();if(duration>0)events.progress(start+Math.min(length-1,(int)((long)player.getCurrentPosition()*length/duration)));}catch(Exception ignored){}
        main.postDelayed(() -> tick(session,start,length,expected),300);
    }
    static int chunkEnd(String text,int start) {
        int end=Math.min(start+320,text.length());
        for(int i=start;i<end;i++)if((text.charAt(i)=='.' || text.charAt(i)=='!' || text.charAt(i)=='?' || text.charAt(i)=='\n') && i>start+20 && (i+1==text.length() || Character.isWhitespace(text.charAt(i+1))))return i+1;
        if(end<text.length()) {
            int space=text.lastIndexOf(' ',end);if(space>start+100)end=space+1;
            if(Character.isHighSurrogate(text.charAt(end-1)))end--;
        }
        return end;
    }
    void close() {stop();worker.execute(() -> {if(engine!=null){engine.release();engine=null;}});worker.shutdown();}
}
