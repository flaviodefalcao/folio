import Foundation
import AVFoundation
import MediaPlayer

final class FolioSpeech:NSObject,AVSpeechSynthesizerDelegate {
    private let synthesizer=AVSpeechSynthesizer()
    private let emit:(String,[String:Any])->Void
    private var offsets=[ObjectIdentifier:Int](),finalUtterance:AVSpeechUtterance?,timer:Timer?
    init(emit:@escaping(String,[String:Any])->Void){self.emit=emit;super.init();synthesizer.delegate=self
        MPRemoteCommandCenter.shared().stopCommand.addTarget{[weak self] _ in DispatchQueue.main.async{self?.stop();self?.emit("speechStopped",[:])};return .success}
    }
    func speak(text:String,language:String,voice:String?,rate:Float,sleepUntil:Double) throws {
        guard !text.isEmpty,text.utf16.count<=2_000_000,rate.isFinite else{throw FolioError.message("Trecho inválido.")}
        stop();try AVAudioSession.sharedInstance().setCategory(.playback,mode:.spokenAudio,options:[]);try AVAudioSession.sharedInstance().setActive(true)
        let selected=voice.flatMap{AVSpeechSynthesisVoice(identifier:$0)} ?? AVSpeechSynthesisVoice(language:language)
        let source=text as NSString;var offset=0
        while offset<source.length {
            let range=source.rangeOfComposedCharacterSequences(for:NSRange(location:offset,length:min(1400,source.length-offset)))
            let utterance=AVSpeechUtterance(string:source.substring(with:range));utterance.voice=selected;utterance.rate=max(AVSpeechUtteranceMinimumSpeechRate,min(AVSpeechUtteranceMaximumSpeechRate,AVSpeechUtteranceDefaultSpeechRate * max(0.5,min(2,rate))))
            utterance.postUtteranceDelay=utterance.speechString.hasSuffix("\n") ? 0.3:0
            offsets[ObjectIdentifier(utterance)]=range.location;finalUtterance=utterance;synthesizer.speak(utterance);offset=NSMaxRange(range)
        }
        MPNowPlayingInfoCenter.default().nowPlayingInfo=[MPMediaItemPropertyTitle:"Folio · Leitura em voz alta",MPNowPlayingInfoPropertyPlaybackRate:rate];setTimer(sleepUntil)
    }
    func setTimer(_ deadline:Double){timer?.invalidate();timer=nil;guard deadline>0 else{return};let remaining=deadline/1000-Date().timeIntervalSince1970
        if remaining<=0{stop();emit("speechStopped",[:]);return};timer=Timer.scheduledTimer(withTimeInterval:remaining,repeats:false){[weak self] _ in self?.stop();self?.emit("speechStopped",[:])}
    }
    func stop(){finalUtterance=nil;offsets.removeAll();timer?.invalidate();timer=nil;synthesizer.stopSpeaking(at:.immediate);MPNowPlayingInfoCenter.default().nowPlayingInfo=nil;try? AVAudioSession.sharedInstance().setActive(false,options:.notifyOthersOnDeactivation)}
    func speechSynthesizer(_ synthesizer:AVSpeechSynthesizer,willSpeakRangeOfSpeechString range:NSRange,utterance:AVSpeechUtterance){guard let offset=offsets[ObjectIdentifier(utterance)] else{return};emit("speechProgress",["offset":offset+range.location])}
    func speechSynthesizer(_ synthesizer:AVSpeechSynthesizer,didFinish utterance:AVSpeechUtterance){offsets.removeValue(forKey:ObjectIdentifier(utterance));if utterance === finalUtterance{finalUtterance=nil;emit("speechEnded",[:])}}
}
