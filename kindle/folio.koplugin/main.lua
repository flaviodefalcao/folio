local WidgetContainer = require("ui/widget/container/widgetcontainer")
local UIManager = require("ui/uimanager")
local InfoMessage = require("ui/widget/infomessage")
local Folio = WidgetContainer:extend{ name = "folio" }
function Folio:init()
    if G_reader_settings and not G_reader_settings:readSetting("audiobook_settings") then
        G_reader_settings:saveSetting("audiobook_settings", {
            tts_backend = "espeak", tts_voice = "pt-br", tts_voice_label = "Português (Brasil)",
        })
    end
    self.ui.menu:registerToMainMenu(self)
end
function Folio:notice(text)
    UIManager:show(InfoMessage:new{ text = text })
end
function Folio:audioMenu()
    local audio = self.ui.audiobook
    if not audio or not audio.addToMainMenu then
        return {{text="Áudio não instalado", callback=function()
            self:notice("Instale Audiobook Read-Along em koreader/plugins e reinicie o KOReader.")
        end}}
    end
    local menus = {}
    audio:addToMainMenu(menus)
    return menus.audiobook and menus.audiobook.sub_item_table or {}
end
function Folio:addToMainMenu(menu_items)
    menu_items.folio = {
        text = "Folio",
        sorting_hint = "tools",
        sub_item_table = {
            { text = "Áudio, vozes e leitura acompanhada", sub_item_table_func=function() return self:audioMenu() end },
            { text = "Receber livros do celular", callback=function()
                if self.ui.opds and self.ui.opds.onShowOPDSCatalog then
                    self.ui.opds:onShowOPDSCatalog()
                else
                    self:notice("Volte à biblioteca do KOReader e abra Folio → Receber livros do celular. No celular: Mais → Conectar Kindle. Adicione o endereço exibido como catálogo OPDS.")
                end
            end },
            { text = "Como ouvir um trecho", callback=function()
                self:notice("Pareie o fone nas configurações da Amazon e volte ao KOReader. Abra um EPUB, selecione um trecho e escolha Read aloud from here. Para ouvir a página atual, abra Folio → Áudio. Voice settings permite escolher idioma, voz e velocidade. O plugin acompanha o texto e vira as páginas; o funcionamento deve ser testado no seu aparelho.")
            end },
            { text = "Integração com o celular · 0.1.0", callback=function()
                self:notice("Folio Kindle 0.1.0 integra o menu de áudio Audiobook Read-Along e o catálogo OPDS do KOReader. O celular envia EPUBs pela mesma rede Wi-Fi. Posição, notas, estatísticas, conversa com IA e atualização pelo celular ainda não são sincronizadas. Os dados de leitura permanecem no KOReader.")
            end },
        },
    }
end
return Folio
