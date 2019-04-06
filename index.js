const url = require('url'),
    {
        VK
    } = require('vk-io');

const {
    VCoinWS,
    miner,
    Entit
} = require('./VCoinWS');

const {
    con,
    ccon,
    setColorsM,
    formateSCORE,
    hashPassCoin,
    rl,
    existsFile,
    existsAsync,
    writeFileAsync,
    appendFileAsync,
    infLog,
    rand,
    onUpdates,
} = require('./helpers');

let {
    USER_ID: depUSER_ID,
    DONEURL,
    VK_TOKEN
} = existsFile('./config.js') ? require('./config.js') : {};

let USER_ID = false;


let vk = new VK();
let URLWS = false;
let boosterTTL = null,
    tryStartTTL = null,
    xRestart = true,
    flog = false,
    offColors = false,
    autoBuy = false,
    autoBuyItems = ["quantum_pc", "datacenter"],
    tforce = false,
    transferTo = false,
    transferScore = 3e4,
    transferInterval = 36e2,
    transferLastTime = 0,
    conserver = 3;


let vConinWS = new VCoinWS();


let missCount = 0,
    missTTL = null;

vConinWS.onMissClickEvent(_ => {
    if (0 === missCount) {
        clearTimeout(missTTL);
        missTTL = setTimeout(_ => {
            missCount = 0;
            return;
        }, 6e4)
    }

    if (++missCount > 20)
        forceRestart(4e3);

    if (++missCount > 10)
        con("Нажатия не засчитываются сервером, возможно, у Вас проблемы с соединением.", true);
});

vConinWS.onReceiveDataEvent(async (place, score) => {
    var n = arguments.length > 2 && void 0 !== arguments[2] && arguments[2],
        trsum = 3e6;

    miner.setScore(score);

    if (place > 0 && !rl.isQst) {
        if (transferTo && transferScore * 1e3 < score && ((Math.floor(Date.now() / 1000) - transferLastTime) > transferInterval)) {
            try {
                await vConinWS.transferToUser(transferTo, transferScore);
                let template = "Автоматически переведено [" + formateSCORE(transferScore * 1e3, true) + "] коинов от vk.com/id" + USER_ID + " для vk.com/id" + transferTo;
                con(template, "black", "Green");
                try {
                    await infLog(template);
                } catch (e) {}
                transferLastTime = Math.floor(Date.now() / 1000);
            } catch (e) {
                con("Автоматический перевод не удалася. Ошибка: " + e.message, true);
            }
        }

        if (autoBuy && score > 0) {
            for (var i = 0; i < autoBuyItems.length; i++) {
                if (miner.hasMoney(autoBuyItems[i])) {
                    try {
                        result = await vConinWS.buyItemById(autoBuyItems[i]);
                        miner.updateStack(result.items);
                        let template = "[AutoBuy] Был приобретен " + Entit.titles[autoBuyItems[i]];;
                        con(template, "black", "Green");
                        try {
                            await infLog(template);
                        } catch (e) {}
                    } catch (e) {
                        if (e.message == "NOT_ENOUGH_COINS") con("Недостаточно средств для покупки", true);
                        else con(e.message, true);
                    }
                }
            }
        }

        con("Позиция в топе: " + place + "\tКоличество коинов: " + formateSCORE(score, true), "yellow");
    }
});

vConinWS.onTransfer(async (id, score) => {
    let template = "Пользватель с id" + USER_ID + " получил [" + formateSCORE(score, true) + "] коинов от id" + id;
    con(template, "black", "Green");
    try {
        await infLog(template);
    } catch (e) {
        console.error(e);
    }
});

vConinWS.onUserLoaded((place, score, items, top, firstTime, tick) => {
    con("Пользователь успешно загружен.");
    con("Скорость коинов: " + formateSCORE(tick, true) + " коинов / тик.");
    miner.setActive(items);
    miner.updateStack(items);

    boosterTTL && clearInterval(boosterTTL);
    boosterTTL = setInterval(_ => {
        rand(0, 5) > 3 && vConinWS.click();
    }, 5e2);
});

vConinWS.onBrokenEvent(_ => {
    con("onBrokenEvent", true);
    xRestart = true;
    forceRestart(3);
});

vConinWS.onAlreadyConnected(_ => {
    con("Обнаружено открытие приложения с другого устройства.", true);
    xRestart = true;
    forceRestart(3);
});

vConinWS.onOffline(_ => {
    if (!xRestart) return;
    con("onOffline", true);
	xRestart = true;
    forceRestart(3);
});

async function startBooster(tw) {
    tryStartTTL && clearTimeout(tryStartTTL);
    tryStartTTL = setTimeout(() => {
        con("Производится запуск VCoinX Legacy.");

        vConinWS.userId = USER_ID;
        vConinWS.run(URLWS, _ => {
            con("VCoinX Legacy был успешно запущен.");
            xRestart = true;
        });
    }, (tw || 1e3));
}

function forceRestart(t, force) {
    vConinWS.close();
    boosterTTL && clearInterval(boosterTTL);
    if (xRestart || force)
        startBooster(t);
}

function lPrices(d) {
    let temp = "";
    temp += Entit.names.map(el => {
        return !miner.hasMoney(el) && d ? "" : "\n\t- [" + el + "] " + Entit.titles[el] + ": " + formateSCORE(miner.getPriceForItem(el), true);
    });
    return temp;
}

rl.on('line', async (line) => {

    if (!URLWS) return;
    let temp, item;

    switch (line.trim().toLowerCase()) {
        case '':
            break;

        case 'debuginformation':
        case 'debuginfo':
        case 'debug':
            console.log("updatesInterval", updatesInterval);
            console.log("updatesLastTime", updatesLastTime);
            console.log("xRestart", xRestart);
            console.log("autobuy", autoBuy);
            console.log("transferTo", transferTo);
            console.log("transferScore", transferScore);
            console.log("transferInterval", transferInterval);
            console.log("transferLastTime", transferLastTime);
            break;

        case 'color':
            setColorsM(offColors = !offColors);
            con("Цвета " + (offColors ? "от" : "в") + "ключены (*^.^*)", "blue");
            break;

        case "hideupd":
        case "hideupdate":
            con("Уведомление об обновлении скрыто.");
            updatesEv = false;
            break;

        case "stop":
        case "pause":
            xRestart = false;
            vConinWS.close();
            break;

        case "s":
        case "run":
            if (vConinWS.connected)
                return con("VCoinX уже запущен и работает!");
            xRestart = true;
            startBooster();
            break;

        case 'b':
        case 'buy':
            temp = lPrices(true);
            ccon("-- Доступные ускорения и их цены --", "red");
            ccon(temp);
            item = await rl.questionAsync("Введи название ускорения [cursor, cpu, cpu_stack, computer, server_vk, quantum_pc, datacenter]: ");
            if (!item) return;
            let result;
            try {
                result = await vConinWS.buyItemById(item);
                miner.updateStack(result.items);
                if (result && result.items)
                    delete result.items;
                con("Новая скорость: " + formateSCORE(result.tick, true) + " коинов / тик.");
            } catch (e) {
                if (e.message == "NOT_ENOUGH_COINS") con("Недостаточно средств.", true);
                else if (e.message == "ITEM NOT FOUND") con("Предмет не найден.", true);
                else con(e.message, true);
            }
            break;

        case 'autobuyitem':
            item = await rl.questionAsync("Введи название ускорения для автоматической покупки [cursor, cpu, cpu_stack, computer, server_vk, quantum_pc, datacenter]: ");
            var array = item.split(" ");
            for (var i = 0; i < array.length; i++) {
                if (!item || !Entit.titles[array[i]]) return;
                con("Для автоматической покупки установлено ускорение: " + Entit.titles[array[i]]);
            }
            autoBuyItems = array;
            break;

        case 'autobuy':
            autoBuy = !autoBuy;
            con("Автопокупка: " + (autoBuy ? "Включена" : "Отключена"));
            break;

        case 'to':
            item = await rl.questionAsync("Введите ID пользователя: ");
            transferTo = parseInt(item.replace(/\D+/g, ""));
            con("Автоматический перевод коинов на vk.com/id" + transferTo);
            break;

        case 'ti':
            item = await rl.questionAsync("Введите интервал: ");
            transferInterval = parseInt(item);
            con("Интервал для автоматического перевода " + transferInterval + " секунд");
            break;

        case 'tsum':
            item = await rl.questionAsync("Введите сумму: ");
            transferScore = parseInt(item);
            con("Количество коинов для автматического перевода " + transferScore + "");
            break;

        case 'p':
        case 'price':
        case 'prices':
            temp = lPrices(true);
            ccon("-- Цены --", "red");
            ccon(temp);

            break;

        case 'tran':
        case 'transfer':
            let count = await rl.questionAsync("Количество: ");
            let id = await rl.questionAsync("ID получателя: ");
            let conf = await rl.questionAsync("Вы уверены? [yes]: ");
            id = parseInt(id.replace(/\D+/g, ""));
            if (conf.toLowerCase() != "yes" || !id || !count) return con("Отправка неудачная, вероятно, один из параметров не был указан.", true);

            try {
                await vConinWS.transferToUser(id, count);
                con("Перевод был выполнен успешно.", "black", "Green");
                let template = "Произведена отпрвка [" + formateSCORE(count * 1e3, true) + "] коинов от vk.com/id" + USER_ID + " для vk.com/id" + id;
                try {
                    await infLog(template);
                } catch (e) {}
            } catch (e) {
                if (e.message == "BAD_ARGS") con("Вероятно, вы где-то указали неверный аргумент.", true);
                else con(e.message, true);
            }
            break;

        case "?":
        case "help":
            ccon("-- VCoinX --", "red");
            ccon("info	- обновление текущенго уровня.");
            ccon("stop(pause)	- остановка майнера.");
            ccon("start(run)	- запуск майнера.");
            ccon("(b)uy	- покупка улучшений.");
            ccon("(p)rice - отображение цен на товары.");
            ccon("tran(sfer)	- перевод игроку.");
            ccon("hideupd(ate) - скрыть уведомление об обновлении.");
            ccon("to - указать ID и включить авто-перевод средств на него.");
            ccon("ti - указать интервал для авто-перевода (в секундах).");
            ccon("tsum - указать сумму для авто-перевода (без запятой).");
            ccon("color - изменить цветовую схему консоли.");
            break;
    }
});
for (var argn = 2; argn < process.argv.length; argn++) {
    let cTest = process.argv[argn],
        dTest = process.argv[argn + 1];

    switch (cTest.trim().toLowerCase()) {

        case '-black':
            {
                flog && con("Цвета отключены (*^.^*)", "blue");
                setColorsM(offColors = !offColors);
                argn++;
                break;
            }

        case '-t':
            {
                if (dTest.length > 80 && dTest.length < 90) {
                    con("Успешно установлен токен.", "blue");
                    VK_TOKEN = dTest;
                    argn++;
                }
                break;
            }
            // Custom URL
        case '-u':
            {
                if (dTest.length > 200 && dTest.length < 255) {
                    con("Пользовательский URL включен", "blue");
                    DONEURL = dTest;
                }
                break;
            }

            // Transfer to ID
        case '-to':
            {
                if (dTest.length > 1 && dTest.length < 11) {
                    transferTo = parseInt(dTest.replace(/\D+/g, ""));
                    con("Включен автоматический перевод коинов на @id" + transferTo);
                }
                break;
            }

        default:
            break;
    }
    if (["-t", "-u", "-to", "-ti", "-tsum", "-autobuyItem"].includes(process.argv[argn])) {
        argn++;
    }

    if (process.argv[argn] == '-autobuyitem') {
        let dTest = process.argv[argn + 1];
        if (typeof dTest == "string" && dTest.length > 1 && dTest.length < 20) {
            if (!Entit.titles[dTest]) return;
            con("Для автопокупки выбрано: " + Entit.titles[dTest]);
            autoBuyItem = dTest;
            argn++;
            continue;
        }
    }

    if (process.argv[argn] == '-tforce') {
        con("Принудительное использование токена включено.")
        tforce = true;
        continue;
    }

    if (process.argv[argn] == '-tsum') {
        let dTest = process.argv[argn + 1];
        if (typeof dTest == "string" && dTest.length >= 1 && dTest.length < 10) {
            transferScore = parseInt(dTest);
            con("Установлено количество коинов для автоматического перевода: " + transferScore + " коинов.");
            argn++;
            continue;
        }
    }

    if (process.argv[argn] == '-ti') {
        let dTest = process.argv[argn + 1];
        if (typeof dTest == "string" && dTest.length >= 1 && dTest.length < 10) {
            transferInterval = parseInt(dTest);
            con("Установлен интервал для автоматического перевода: " + transferInterval + " секунд.");
            argn++;
            continue;
        }
    }

    if (process.argv[argn] == '-autobuy') {
        autoBuy = true;
        continue;
    }

    if (process.argv[argn] == '-flog') {
        flog = true;
        continue;
    }

    if (process.argv[argn] == "-h" || process.argv[argn] == "-help") {
        ccon("-- VCoinX arguments --", "red");
        ccon("-help			- помощь.");
        ccon("-flog			- подробные логи.");
        ccon("-tforce		- принудительно использовать токен.");
        ccon("-tsum [sum]	- включить функцию для авто-перевода.");
        ccon("-to [id]		- указать ID для авто-перевода.");
        ccon("-ti [seconds]	- установить инетрвал для автоматического перевода.");
        ccon("-u [URL]		- задать ссылку.");
        ccon("-t [TOKEN]	- задать токен.");
        ccon("-black      - отключить цвета консоли.")
        process.exit();
        continue;
    }
}

if (!DONEURL || tforce) {
    if (!VK_TOKEN) {
        con("Отсутствует токен, о том, как его получить рассказано на -> github.com/cursedseal/VCoinX", true);
        return process.exit();
    }

    (async function inVKProc(token) {
        vk.token = token;
        try {
            let {
                mobile_iframe_url
            } = (await vk.api.apps.get({
                app_id: 6915965
            })).items[0];

            if (!mobile_iframe_url)
                throw ("Не удалось получить ссылку на приложение.");

            let {
                id
            } = (await vk.api.users.get())[0];
            if (!id)
                throw ("Не удалось получить ID пользователя.");

            USER_ID = id;

            formatWSS(mobile_iframe_url);
            startBooster();

        } catch (error) {
            console.error('API Error:', error);
            process.exit();
        }
    })(VK_TOKEN);
} else {
    let GSEARCH = url.parse(DONEURL, true);
    if (!GSEARCH.query || !GSEARCH.query.vk_user_id) {
        con("При анализе ссылки не был найден vk_user_id.", true);
        return process.exit();
    }
    USER_ID = parseInt(GSEARCH.query.vk_user_id);

    formatWSS(DONEURL);
    startBooster();
}

function formatWSS(LINK) {
    let GSEARCH = url.parse(LINK),
        NADDRWS = GSEARCH.protocol.replace("https:", "wss:").replace("http:", "ws:") + "//" + GSEARCH.host + "/channel/",
        CHANNEL = USER_ID % 16;
    // URLWS = NADDRWS + CHANNEL + GSEARCH.search + "&ver=1&pass=".concat(Entit.hashPassCoin(USER_ID, 0));
    URLWS = NADDRWS + CHANNEL + GSEARCH.search + "&pass=".concat(Entit.hashPassCoin(USER_ID, 0));
    switch (conserver) {
        case 1:
            URLWS.replace("coin.vkforms.ru", "coin.w5.vkforms.ru");
            break;

        case 2:
            URLWS.replace("coin.vkforms.ru", "bagosi-go-go.vkforms.ru");
            break;

        case 3:
            URLWS = URLWS.replace("coin.vkforms.ru", (CHANNEL > 7) ? "bagosi-go-go.vkforms.ru" : "coin.w5.vkforms.ru");
            break;

        default:
            URLWS = URLWS.replace("coin.vkforms.ru", "coin-without-bugs.vkforms.ru");
            break;
    }

    flog && console.log("formatWSS: ", URLWS);
    return URLWS;
}