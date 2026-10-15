import UIKit
import WebKit

/// Remote content has its own WKWebView and no Capacitor script handlers or key access.
final class FolioBrowser:UIViewController,WKNavigationDelegate {
    let url:URL,collect:String
    var onClose:(()->Void)?,onDownload:((String)->Void)?,onCollect:((String,URL)->Void)?
    private var browser:WKWebView!
    init(url:URL,collect:String){self.url=url;self.collect=collect;super.init(nibName:nil,bundle:nil)}
    required init?(coder:NSCoder){fatalError("Use init(url:collect:)")}
    override func viewDidLoad(){super.viewDidLoad();title=url.host?.contains("chatgpt.site")==true ? "Entrelinhas":"Catálogo no Folio"
        let config=WKWebViewConfiguration();config.websiteDataStore = .default();config.preferences.javaScriptCanOpenWindowsAutomatically=false
        browser=WKWebView(frame:.zero,configuration:config);browser.navigationDelegate=self;browser.translatesAutoresizingMaskIntoConstraints=false;view.addSubview(browser)
        NSLayoutConstraint.activate([browser.topAnchor.constraint(equalTo:view.safeAreaLayoutGuide.topAnchor),browser.bottomAnchor.constraint(equalTo:view.safeAreaLayoutGuide.bottomAnchor),browser.leadingAnchor.constraint(equalTo:view.leadingAnchor),browser.trailingAnchor.constraint(equalTo:view.trailingAnchor)])
        navigationItem.leftBarButtonItem=UIBarButtonItem(title:"Fechar",style:.plain,target:self,action:#selector(close))
        navigationItem.rightBarButtonItems=[UIBarButtonItem(title:"↗",style:.plain,target:self,action:#selector(external))]
        if !collect.isEmpty{navigationItem.rightBarButtonItems?.append(UIBarButtonItem(title:"Usar resultados",style:.plain,target:self,action:#selector(useResults)))}
        browser.load(URLRequest(url:url))
    }
    @objc private func close(){dismiss(animated:true);onClose?()}
    @objc private func external(){UIApplication.shared.open(browser.url ?? url)}
    @objc private func useResults(){guard let current=browser.url,FolioCore.origin(current)==FolioCore.origin(url),current.path=="/search" || collect=="links" && current.path.hasPrefix("/md5/") else{showError("Abra uma página de busca ou um livro do catálogo.");return}
        browser.evaluateJavaScript("document.documentElement.outerHTML"){result,_ in guard let html=result as? String,html.utf8.count<=8*1024*1024,self.browser.url==current else{return};self.onCollect?(html,current)}
    }
    func showError(_ message:String){let alert=UIAlertController(title:"Folio",message:message,preferredStyle:.alert);alert.addAction(UIAlertAction(title:"OK",style:.default));present(alert,animated:true)}
    func webView(_ webView:WKWebView,decidePolicyFor navigationAction:WKNavigationAction,decisionHandler:@escaping(WKNavigationActionPolicy)->Void){
        guard let target=navigationAction.request.url,(try? FolioCore.https(target.absoluteString)) != nil else{decisionHandler(.cancel);return}
        if navigationAction.targetFrame?.isMainFrame != false && target.path.lowercased().hasSuffix(".epub"){decisionHandler(.cancel);onDownload?(target.absoluteString);return}
        if navigationAction.targetFrame==nil{webView.load(URLRequest(url:target));decisionHandler(.cancel);return};decisionHandler(.allow)
    }
    func webView(_ webView:WKWebView,decidePolicyFor navigationResponse:WKNavigationResponse,decisionHandler:@escaping(WKNavigationResponsePolicy)->Void){
        if navigationResponse.isForMainFrame,navigationResponse.response.mimeType=="application/epub+zip",let target=navigationResponse.response.url{decisionHandler(.cancel);onDownload?(target.absoluteString)}else{decisionHandler(.allow)}
    }
}
