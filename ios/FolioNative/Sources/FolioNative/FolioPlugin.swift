import Foundation
import UIKit
import AVFoundation
import Security
import WebKit
import Capacitor
import SwiftSoup

public final class FolioBridgeViewController: CAPBridgeViewController {
    public override func capacitorDidLoad() { bridge?.registerPluginInstance(FolioPlugin()) }
    public override var prefersStatusBarHidden: Bool { UserDefaults.standard.bool(forKey:"folio.immersive") }
}

@objc(FolioPlugin)
public final class FolioPlugin: CAPPlugin, CAPBridgedPlugin, UIDocumentPickerDelegate {
    public let identifier="FolioPlugin"
    public let jsName="FolioNative"
    public let pluginMethods:[CAPPluginMethod] = ["getSettings","saveSettings","chat","download","downloadAnna","openExternal","exportFile","speechVoices","speak","stopSpeaking","speechTimer","setAppTheme","setImmersive","searchBooks","searchCatalog","openCatalog","catalogLinks","recommendationsFeed","openRecommendations"].map { CAPPluginMethod(name:$0,returnType:CAPPluginReturnPromise) }
    private let defaults=UserDefaults.standard
    private var audio:FolioSpeech!
    private var pendingExport:CAPPluginCall?
    private var exportURL:URL?
    private var downloadBusy=false
    private var browserOpen=false
    private var accountCookie=""
    public override func load() { audio=FolioSpeech { [weak self] name,data in self?.notifyListeners(name,data:data) } }
    private func run(_ call:CAPPluginCall,_ operation:@escaping () async throws -> [String:Any]) {
        Task { do { let result=try await operation();await MainActor.run { call.resolve(result) } }
            catch { let message=(error as? FolioError)?.localizedDescription ?? "Não foi possível concluir a operação. Confira a conexão.";await MainActor.run { call.reject(message) } } }
    }
    private func secret(_ name:String) -> String {
        var query:[String:Any]=[kSecClass as String:kSecClassGenericPassword,kSecAttrService as String:"org.folio.reader",kSecAttrAccount as String:name,kSecReturnData as String:true,kSecMatchLimit as String:kSecMatchLimitOne]
        query[kSecAttrSynchronizable as String]=false
        var item:CFTypeRef?;guard SecItemCopyMatching(query as CFDictionary,&item)==errSecSuccess,let data=item as? Data else{return ""};return String(data:data,encoding:.utf8) ?? ""
    }
    private func saveSecret(_ name:String,_ value:String) throws {
        let query:[String:Any]=[kSecClass as String:kSecClassGenericPassword,kSecAttrService as String:"org.folio.reader",kSecAttrAccount as String:name,kSecAttrSynchronizable as String:false]
        if value.isEmpty { let code=SecItemDelete(query as CFDictionary);guard code==errSecSuccess || code==errSecItemNotFound else{throw FolioError.message("Não foi possível remover a chave do Keychain.")};return }
        let fields:[String:Any]=[kSecValueData as String:Data(value.utf8),kSecAttrAccessible as String:kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly]
        var code=SecItemUpdate(query as CFDictionary,fields as CFDictionary)
        if code==errSecItemNotFound {code=SecItemAdd(query.merging(fields){_,new in new} as CFDictionary,nil)}
        guard code==errSecSuccess else{throw FolioError.message("O iOS não conseguiu proteger a chave no Keychain.")}
    }
    private func settings() -> [String:Any] {
        var result:[String:Any]=["model":defaults.string(forKey:"folio.model") ?? "gpt-5-nano","annaUrl":defaults.string(forKey:"folio.annaUrl") ?? "https://annas-archive.gl","hasApiKey":!secret("openai").isEmpty,"hasAnnaKey":!secret("anna").isEmpty,"supportsAnnaPremium":true,"supportsIntegratedCatalog":true]
        if let quota=defaults.dictionary(forKey:"folio.quota"){result["annaQuota"]=quota};return result
    }
    @objc func getSettings(_ call:CAPPluginCall){call.resolve(settings())}
    @objc func saveSettings(_ call:CAPPluginCall){run(call){
        let base=try FolioCore.anna(call.getString("annaUrl") ?? self.defaults.string(forKey:"folio.annaUrl") ?? "https://annas-archive.gl")
        let model=call.getString("model") ?? self.defaults.string(forKey:"folio.model") ?? "gpt-5-nano"
        guard model.range(of:"^[a-zA-Z0-9_.:-]{1,100}$",options:.regularExpression) != nil else{throw FolioError.message("Modelo inválido.")}
        let openAI=call.getString("apiKey")?.trimmingCharacters(in:.whitespacesAndNewlines) ?? "", anna=call.getString("annaKey")?.trimmingCharacters(in:.whitespacesAndNewlines) ?? ""
        guard openAI.count<=4096,anna.count<=4096,!(call.getBool("removeAnnaKey") == true && !anna.isEmpty) else{throw FolioError.message("Chave inválida.")}
        if !openAI.isEmpty{try self.saveSecret("openai",openAI)}
        if call.getBool("removeAnnaKey")==true{try self.saveSecret("anna","")}else if !anna.isEmpty{try self.saveSecret("anna",anna)}
        if !anna.isEmpty || call.getBool("removeAnnaKey")==true || base.absoluteString != self.defaults.string(forKey:"folio.annaUrl"){self.accountCookie="";self.defaults.removeObject(forKey:"folio.quota")}
        self.defaults.set(base.absoluteString,forKey:"folio.annaUrl");self.defaults.set(model,forKey:"folio.model");return self.settings()
    }}
    @objc func chat(_ call:CAPPluginCall){run(call){
        let key=self.secret("openai");guard !key.isEmpty else{throw FolioError.message("Configure a chave OpenAI em Preferências.")}
        let payload=try FolioCore.chatPayload(call.dictionaryRepresentation as? [String:Any] ?? [:],model:self.defaults.string(forKey:"folio.model") ?? "gpt-5-nano")
        var request=URLRequest(url:URL(string:"https://api.openai.com/v1/responses")!);request.httpMethod="POST";request.httpBody=try JSONSerialization.data(withJSONObject:payload);request.setValue("Bearer \(key)",forHTTPHeaderField:"Authorization");request.setValue("application/json",forHTTPHeaderField:"Content-Type")
        let (data,response)=try await SafeHTTP.fetch(request,limit:4*1024*1024,sameOrigin:true)
        guard response.statusCode==200,let result=try JSONSerialization.jsonObject(with:data) as? [String:Any] else{throw FolioError.message("A OpenAI não respondeu. Confira a chave, o modelo e o saldo da API.")}
        let output=result["output"] as? [[String:Any]] ?? []
        let text=output.filter{($0["type"] as? String)=="message"}.flatMap{$0["content"] as? [[String:Any]] ?? []}.filter{($0["type"] as? String)=="output_text"}.compactMap{$0["text"] as? String}.joined(separator:"\n")
        guard !text.isEmpty else{throw FolioError.message("O modelo não retornou texto.")};return ["text":text]
    }}
    private func transfer(_ url:URL) async throws -> [String:Any] {
        let (data,response)=try await SafeHTTP.fetch(URLRequest(url:url),limit:40*1024*1024)
        guard response.statusCode==200,data.count>4,data.starts(with:[0x50,0x4b,0x03,0x04]) else{throw FolioError.message("O servidor não retornou um arquivo EPUB. Abra a página para verificar.")}
        // The shared importer validates ZIP paths, package XML and EPUB structure before saving.
        let raw=url.lastPathComponent.isEmpty ? "livro.epub":url.lastPathComponent
        let name=String(raw.filter{!$0.isNewline && $0 != "/" && $0 != "\\"}.prefix(160))
        return ["name":name.lowercased().hasSuffix(".epub") ? name:name+".epub","base64":data.base64EncodedString()]
    }
    @objc func download(_ call:CAPPluginCall){run(call){
        guard !self.downloadBusy else{throw FolioError.message("Já existe um download em andamento.")};self.downloadBusy=true;defer{self.downloadBusy=false}
        return try await self.transfer(FolioCore.https(call.getString("url") ?? ""))
    }}
    private func cookies(_ url:URL) async -> String {
        let all:[HTTPCookie]=await withCheckedContinuation{c in DispatchQueue.main.async{WKWebsiteDataStore.default().httpCookieStore.getAllCookies{c.resume(returning:$0)}}}
        return all.filter{let domain=$0.domain.trimmingCharacters(in:CharacterSet(charactersIn:"."));return ($0.expiresDate ?? .distantFuture)>Date() && (url.host==domain || url.host?.hasSuffix("."+domain)==true) && ($0.isSecure || url.scheme=="https")}.map{"\($0.name)=\($0.value)"}.joined(separator:"; ")
    }
    @objc func downloadAnna(_ call:CAPPluginCall){run(call){
        guard !self.downloadBusy else{throw FolioError.message("Já existe um download em andamento.")};self.downloadBusy=true;defer{self.downloadBusy=false}
        let base=try FolioCore.anna(self.defaults.string(forKey:"folio.annaUrl") ?? "https://annas-archive.gl"),key=self.secret("anna"),hash=call.getString("md5") ?? ""
        guard !key.isEmpty,hash.range(of:"^[a-fA-F0-9]{32}$",options:.regularExpression) != nil else{throw FolioError.message("Configure a chave premium e escolha um livro válido.")}
        let path=call.getInt("pathIndex") ?? 0,domain=call.getInt("domainIndex") ?? 0;guard (0...1000).contains(path),(0...1000).contains(domain) else{throw FolioError.message("Servidor inválido.")}
        var components=URLComponents(url:base.appendingPathComponent("dyn/api/fast_download.json"),resolvingAgainstBaseURL:false)!
        components.queryItems=[URLQueryItem(name:"md5",value:hash),URLQueryItem(name:"key",value:key),URLQueryItem(name:"path_index",value:String(path)),URLQueryItem(name:"domain_index",value:String(domain))]
        var request=URLRequest(url:components.url!);request.setValue("application/json",forHTTPHeaderField:"Accept");request.setValue(await self.cookies(base),forHTTPHeaderField:"Cookie")
        let (data,response)=try await SafeHTTP.fetch(request,limit:1024*1024,sameOrigin:true)
        guard let ticket=try? JSONSerialization.jsonObject(with:data) as? [String:Any] else{throw FolioError.message("Abra o catálogo no Folio para concluir a verificação da conta.")}
        guard response.statusCode==200,let value=ticket["download_url"] as? String else{
            let error=(ticket["error"] as? String ?? "").lowercased()
            if error.contains("quota") || error.contains("no downloads") || response.statusCode==429{throw FolioError.message("A franquia premium foi esgotada.")}
            throw FolioError.message("A API premium recusou o download. Confira a chave e a assinatura.")
        }
        guard !(value.removingPercentEncoding ?? value).contains(key) else{throw FolioError.message("Link de download inválido.")}
        var result=try await self.transfer(FolioCore.https(value))
        if let raw=ticket["account_fast_download_info"] as? [String:Any],let remaining=raw["downloads_left"] as? Int,let perDay=raw["downloads_per_day"] as? Int {
            let quota:[String:Any]=["remaining":remaining,"perDay":perDay,"reportedAt":Date().timeIntervalSince1970*1000];self.defaults.set(quota,forKey:"folio.quota");result["quota"]=quota
        };return result
    }}
    @objc func recommendationsFeed(_ call:CAPPluginCall){run(call){let (data,response)=try await SafeHTTP.fetch(URLRequest(url:URL(string:FolioCore.feed)!),limit:8*1024*1024,allowedHosts:{$0=="docs.google.com" || $0.hasSuffix(".googleusercontent.com")});guard response.statusCode==200 else{throw FolioError.message("Não foi possível atualizar as recomendações.")};return ["base64":data.base64EncodedString()]}}
    @objc func openExternal(_ call:CAPPluginCall){do{let url=try FolioCore.https(call.getString("url") ?? "");DispatchQueue.main.async{UIApplication.shared.open(url,options:[:]){ok in if ok{call.resolve()}else{call.reject("Não foi possível abrir a página.")}}}}catch{call.reject("Endereço HTTPS inválido.")}}
    @objc func exportFile(_ call:CAPPluginCall){
        guard pendingExport==nil,let value=call.getString("text"),value.utf8.count<=10*1024*1024 else{call.reject("Exportação indisponível ou muito grande.");return}
        let name=String((call.getString("name") ?? "folio.txt").replacingOccurrences(of:"/",with:"_").replacingOccurrences(of:"\\",with:"_").prefix(120))
        let directory=FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString,isDirectory:true),url=directory.appendingPathComponent(name)
        do{try FileManager.default.createDirectory(at:directory,withIntermediateDirectories:true);try Data(value.utf8).write(to:url,options:[.atomic,.completeFileProtection]);pendingExport=call;exportURL=url
            DispatchQueue.main.async{let picker=UIDocumentPickerViewController(forExporting:[url],asCopy:true);picker.delegate=self;self.bridge?.viewController?.present(picker,animated:true)}
        }catch{call.reject("Não foi possível exportar o arquivo.")}
    }
    public func documentPickerWasCancelled(_ controller:UIDocumentPickerViewController){finishExport(false)}
    public func documentPicker(_ controller:UIDocumentPickerViewController,didPickDocumentsAt urls:[URL]){finishExport(true)}
    private func finishExport(_ saved:Bool){pendingExport?.resolve(["saved":saved]);pendingExport=nil;if let url=exportURL{try? FileManager.default.removeItem(at:url.deletingLastPathComponent())};exportURL=nil}
    @objc func speechVoices(_ call:CAPPluginCall){DispatchQueue.main.async{call.resolve(["voices":AVSpeechSynthesisVoice.speechVoices().map{ voice -> [String:Any] in
        var name=voice.name
        if #available(iOS 16.0,*),voice.quality == .premium{name += " · premium"}else if voice.quality == .enhanced{name += " · aprimorada"}
        return ["id":voice.identifier,"name":name,"language":voice.language,"network":false]
    }])}}
    @objc func speak(_ call:CAPPluginCall){DispatchQueue.main.async{do{try self.audio.speak(text:call.getString("text") ?? "",language:call.getString("language") ?? "pt-BR",voice:call.getString("voice"),rate:call.getFloat("rate") ?? 1,sleepUntil:call.getDouble("sleepUntil") ?? 0);call.resolve()}catch{call.reject("Não foi possível iniciar a voz do iPhone.")}}}
    @objc func stopSpeaking(_ call:CAPPluginCall){DispatchQueue.main.async{self.audio.stop();call.resolve()}}
    @objc func speechTimer(_ call:CAPPluginCall){DispatchQueue.main.async{self.audio.setTimer(call.getDouble("sleepUntil") ?? 0);call.resolve()}}
    @objc func setAppTheme(_ call:CAPPluginCall){DispatchQueue.main.async{self.bridge?.viewController?.overrideUserInterfaceStyle=call.getString("theme")=="light" ? .light:.dark;call.resolve()}}
    @objc func setImmersive(_ call:CAPPluginCall){DispatchQueue.main.async{self.defaults.set(call.getBool("enabled") ?? false,forKey:"folio.immersive");self.bridge?.viewController?.setNeedsStatusBarAppearanceUpdate();call.resolve()}}
    private func catalogBase() throws -> URL { try FolioCore.anna(defaults.string(forKey:"folio.annaUrl") ?? "https://annas-archive.gl") }
    private func html(_ url:URL) async throws -> (String,Int) {
        var request=URLRequest(url:url);request.setValue("text/html",forHTTPHeaderField:"Accept")
        let existing=await cookies(url);request.setValue([existing,accountCookie].filter{!$0.isEmpty}.joined(separator:"; "),forHTTPHeaderField:"Cookie")
        let (data,response)=try await SafeHTTP.fetch(request,limit:8*1024*1024,sameOrigin:true);return (String(data:data,encoding:.utf8) ?? "",response.statusCode)
    }
    private func parseSearch(_ html:String,_ status:Int,_ base:URL,_ page:Int) throws -> [String:Any] {
        let doc=try SwiftSoup.parse(html,base.absoluteString),title=try doc.title().lowercased()
        if status==403 || status==429 || title=="ddos-guard" || title.hasPrefix("just a moment") {return ["results":[],"page":page,"hasMore":false,"challenge":true,"error":"Abra o catálogo no Folio para concluir a verificação."]}
        guard status==200,let outer=try doc.select(".js-aarecord-list-outer").first() else{throw FolioError.message("O catálogo não retornou resultados reconhecíveis.")}
        var books=[[String:Any]](),seen=Set<String>()
        for card in try outer.select("a.js-vim-focus[href]").array().prefix(100) {
            guard let url=URL(string:try card.attr("href"),relativeTo:base)?.absoluteURL,FolioCore.origin(url)==FolioCore.origin(base),url.path.range(of:"^/md5/[a-fA-F0-9]{32}/?$",options:.regularExpression) != nil else{continue}
            let id=url.lastPathComponent;guard seen.insert(id).inserted,let heading=try card.select("h3").first() else{continue}
            let metadata=try card.select(".text-gray-500").text(),author=try card.select(".italic").text(),name=try heading.text()
            books.append(["id":id,"md5":id,"title":String(name.prefix(500)),"author":String(author.prefix(500)),"format":metadata.lowercased().contains("epub") ? "epub":"","language":"","url":url.absoluteString,"provider":"anna","metadata":String(metadata.prefix(1000))])
            if books.count>=50{break}
        }
        return ["results":books,"page":page,"hasMore":false,"provider":"anna"]
    }
    @objc func searchCatalog(_ call:CAPPluginCall){run(call){
        let base=try self.catalogBase(),query=call.getString("query") ?? "",page=call.getInt("page") ?? 1
        guard query.count<=500,(1...100).contains(page) else{throw FolioError.message("Busca inválida.")}
        var parts=URLComponents(url:base.appendingPathComponent("search"),resolvingAgainstBaseURL:false)!
        parts.queryItems=[URLQueryItem(name:"q",value:query),URLQueryItem(name:"ext",value:"epub"),URLQueryItem(name:"display",value:"list_compact"),URLQueryItem(name:"page",value:String(page))]
        if let language=call.getString("language"),!language.isEmpty{parts.queryItems?.append(URLQueryItem(name:"lang",value:language))}
        var (source,status)=try await self.html(parts.url!)
        var parsed=try self.parseSearch(source,status,parts.url!,page)
        let key=self.secret("anna")
        if parsed["challenge"] as? Bool==true && !key.isEmpty && self.accountCookie.isEmpty {
            var request=URLRequest(url:base.appendingPathComponent("account/"));request.httpMethod="POST"
            var form=URLComponents();form.queryItems=[URLQueryItem(name:"key",value:key)];request.httpBody=form.percentEncodedQuery?.data(using:.utf8);request.setValue("application/x-www-form-urlencoded",forHTTPHeaderField:"Content-Type")
            let (_,response)=try await SafeHTTP.fetch(request,limit:1024*1024,allowRedirects:false,sameOrigin:true)
            let headers=response.allHeaderFields.reduce(into:[String:String]()){result,item in if let key=item.key as? String,let value=item.value as? String{result[key]=value}}
            if let cookie=HTTPCookie.cookies(withResponseHeaderFields:headers,for:base).first(where:{$0.name=="aa_account_id2"}) {
                self.accountCookie="\(cookie.name)=\(cookie.value)"
                (source,status)=try await self.html(parts.url!);parsed=try self.parseSearch(source,status,parts.url!,page)
            }
        };return parsed
    }}
    @objc func searchBooks(_ call:CAPPluginCall){run(call){
        var parts=URLComponents(string:"https://gutendex.com/books/")!;parts.queryItems=[URLQueryItem(name:"search",value:String((call.getString("query") ?? "").prefix(500))),URLQueryItem(name:"page",value:String(max(1,min(100,call.getInt("page") ?? 1))))]
        if let lang=call.getString("language"),!lang.isEmpty{parts.queryItems?.append(URLQueryItem(name:"languages",value:lang))}
        let (data,response)=try await SafeHTTP.fetch(URLRequest(url:parts.url!),limit:4*1024*1024,sameOrigin:true)
        guard response.statusCode==200,let json=try JSONSerialization.jsonObject(with:data) as? [String:Any] else{throw FolioError.message("Catálogo indisponível.")}
        let entries=json["results"] as? [[String:Any]] ?? []
        let results=entries.compactMap{book -> [String:Any]? in
            guard book["copyright"] as? Bool==false,let id=book["id"] as? Int,let formats=book["formats"] as? [String:String],let raw=formats["application/epub+zip"],let url=try? FolioCore.https(raw.replacingOccurrences(of:"http://",with:"https://")) else{return nil}
            return ["id":"gutenberg:\(id)","title":book["title"] as? String ?? "Livro","author":(book["authors"] as? [[String:Any]] ?? []).compactMap{$0["name"] as? String}.joined(separator:", "),"language":(book["languages"] as? [String] ?? []).joined(separator:", "),"format":"epub","url":"https://www.gutenberg.org/ebooks/\(id)","downloadUrl":url.absoluteString,"provider":"gutenberg"]
        };return ["results":results,"page":call.getInt("page") ?? 1,"hasMore":json["next"] as? String != nil,"count":json["count"] as? Int ?? 0]
    }}
    @objc func catalogLinks(_ call:CAPPluginCall){run(call){
        let base=try self.catalogBase(),url=try FolioCore.https(call.getString("url") ?? "")
        guard FolioCore.origin(url)==FolioCore.origin(base),url.path.range(of:"^/md5/[a-fA-F0-9]{32}/?$",options:.regularExpression) != nil else{throw FolioError.message("Escolha um livro do catálogo configurado.")}
        let (source,status)=try await self.html(url);guard status==200 else{throw FolioError.message("Abra a página do livro no catálogo para verificar o acesso.")}
        return try self.links(source,url)
    }}
    private func links(_ source:String,_ base:URL) throws -> [String:Any] {
        let doc=try SwiftSoup.parse(source,base.absoluteString);var options=[[String:Any]](),seen=Set<String>()
        for link in try doc.select("#md5-panel-downloads a[href]").array().prefix(150) {
            guard let target=URL(string:try link.attr("href"),relativeTo:base)?.absoluteURL,(try? FolioCore.https(target.absoluteString)) != nil,seen.insert(target.absoluteString).inserted else{continue}
            let key=secret("anna");if !key.isEmpty && (target.absoluteString.removingPercentEncoding ?? target.absoluteString).contains(key){continue}
            let premium=FolioCore.origin(target)==FolioCore.origin(base) && target.path.hasPrefix("/fast_download/")
            var option:[String:Any]=["id":String(options.count),"label":String((try link.text()).prefix(150)),"url":target.absoluteString,"kind":premium ? "premium":target.path.lowercased().hasSuffix(".epub") ? "direct":"page"]
            if premium{let bits=target.path.split(separator:"/");if bits.count>=4{option["pathIndex"]=Int(bits[2]) ?? 0;option["domainIndex"]=Int(bits[3]) ?? 0}}
            options.append(option)
        };return ["options":options]
    }
    @objc func openRecommendations(_ call:CAPPluginCall){openBrowser(call,url:URL(string:FolioCore.site)!,collect:"")}
    @objc func openCatalog(_ call:CAPPluginCall){do{
        let url=try FolioCore.https(call.getString("url") ?? ""),collect=call.getString("collect") ?? ""
        guard ["","search","links"].contains(collect) else{throw FolioError.message("Modo inválido.")}
        if !collect.isEmpty{guard FolioCore.origin(url)==FolioCore.origin(try catalogBase()) else{throw FolioError.message("O link não pertence ao catálogo configurado.")}}
        openBrowser(call,url:url,collect:collect)
    }catch{call.reject("Endereço do catálogo inválido.")}}
    private func openBrowser(_ call:CAPPluginCall,url:URL,collect:String){DispatchQueue.main.async{
        guard !self.browserOpen else{call.reject("Uma página já está aberta no Folio.");return};self.browserOpen=true
        let controller=FolioBrowser(url:url,collect:collect)
        controller.onClose={ self.browserOpen=false;call.resolve() }
        controller.onDownload={ value in self.run(call){defer{DispatchQueue.main.async{self.browserOpen=false;controller.dismiss(animated:true)}};let result=try await self.transfer(FolioCore.https(value));await MainActor.run{self.notifyListeners("catalogDownload",data:result,retainUntilConsumed:true)};return [:]} }
        controller.onCollect={ source,current in
            do{guard FolioCore.origin(current)==FolioCore.origin(url) else{throw FolioError.message("A página mudou de servidor.")}
                let result=try collect=="links" ? self.links(source,current):self.parseSearch(source,200,current,1)
                if result["challenge"] as? Bool==true{throw FolioError.message("Conclua a verificação no site antes de importar os resultados.")}
                self.notifyListeners(collect=="links" ? "catalogLinks":"catalogResults",data:result,retainUntilConsumed:true);controller.dismiss(animated:true);self.browserOpen=false;call.resolve()
            }catch{controller.showError("Não foi possível organizar esta página. Aguarde a busca terminar.")}
        }
        let nav=UINavigationController(rootViewController:controller);nav.modalPresentationStyle = .fullScreen
        self.bridge?.viewController?.present(nav,animated:true)
    }}
}
