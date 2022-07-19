/**
* @name Transcoder
* @displayName Transcoder
* @authorId 97842053588713472
* @version 0.1.2
*/
/*@cc_on
@if (@_jscript)
    
    // Offer to self-install for clueless users that try to run this directly.
    var shell = WScript.CreateObject("WScript.Shell");
    var fs = new ActiveXObject("Scripting.FileSystemObject");
    var pathPlugins = shell.ExpandEnvironmentStrings("%APPDATA%\BetterDiscord\plugins");
    var pathSelf = WScript.ScriptFullName;
    // Put the user at ease by addressing them in the first person
    shell.Popup("It looks like you've mistakenly tried to run me directly. \n(Don't do that!)", 0, "I'm a plugin for BetterDiscord", 0x30);
    if (fs.GetParentFolderName(pathSelf) === fs.GetAbsolutePathName(pathPlugins)) {
        shell.Popup("I'm in the correct folder already.", 0, "I'm already installed", 0x40);
    } else if (!fs.FolderExists(pathPlugins)) {
        shell.Popup("I can't find the BetterDiscord plugins folder.\nAre you sure it's even installed?", 0, "Can't install myself", 0x10);
    } else if (shell.Popup("Should I copy myself to BetterDiscord's plugins folder for you?", 0, "Do you need some help?", 0x34) === 6) {
        fs.CopyFile(pathSelf, fs.BuildPath(pathPlugins, fs.GetFileName(pathSelf)), true);
        // Show the user where to put plugins in the future
        shell.Exec("explorer " + pathPlugins);
        shell.Popup("I'm installed!", 0, "Successfully installed", 0x40);
    }
    WScript.Quit();

@else@*/

module.exports = (() => {
    const config = {
        info: {
            name: "Transcoder",
            authors: [
                {
                    name: "Torca",
                    discord_id: "97842053588713472",
                    github_username: "Torca"
                }
            ],
            version: "0.1.2",
            description: "Transcode uploaded videos to fit within file size limit",
            github: "https://github.com/Torca2001/BD-Transcoder",
            github_raw: "https://raw.githubusercontent.com/Torca2001/BD-Transcoder/main/Transcoder.plugin.js"
        },
        changelog: [
            {
                title: "More Features",
                items: [
                    'More video encoding options',
                    'Image compression, convert images to webp',
                    'Fixed bug in loading'
                ]
            }
        ],
        defaultConfig: [
            {
                type: "switch",
                id: "renameFileExt",
                value: "true",
                name: "Fix extension type",
                note: "Fix video file extensions to ensure embed"
            },
            {
                type: "switch",
                id: "compressImages",
                value: "false",
                name: "Always Compress images",
                note: "Any uploaded images will be compressed to webp, otherwise only compress images that exceed file upload size"
            },
            {
                type: "textbox",
                id: "imageQuality",
                value: "90",
                name: "Image quality",
                note: "1 - 100, Webp image compression quality"
            },
            {
                type: "switch",
                id: "twoPassEncode",
                value: "false",
                disabled: "true",
                name: "Two pass encode",
                note: "Whether to use two pass encoding. Doubles encode time but does improve compression"
            },
            {
                type: "dropdown",
                id: "codec",
                value: "libx264",
                name: "Codec",
                note: "Type of codec to compress",
                options: [
                    { label: 'H264', value: 'libx264' },
                    { label: 'VP9', value: 'libvpx-vp9' }
                ]
            },
            {
                type: "textbox",
                id: "maxfps",
                value: "30",
                name: "Max fps",
                note: "Limit the videos fps to improve compression"
            },
            {
                type: "textbox",
                id: "maxWidth",
                value: "",
                name: "Max Width",
                note: "Scale down videos to this width to save on size, maintains aspect ratio. Leave blank to turn this off"
            },
            {
                type: "textbox",
                id: "maxHeight",
                value: "",
                name: "Max Height",
                note: "Scale down videos to this height to save on size, maintains aspect ratio. Leave blank to turn this off"
            },
            {
                type: "textbox",
                id: "targetFileSize",
                value: "",
                name: "Target size",
                note: "File size to target compression for in MB, this is capped by whatever your max file upload size is normal: 8MB, Nitro: 100MB"
            },
            {
                type: "textbox",
                id: "targetMultipler",
                value: "0.97",
                name: "Overhead multiplier",
                note: "Scaling factor to accomodate the file overhead for the compression"
            },
            {
                type: "textbox",
                id: "bitrateMin",
                value: "1800",
                name: "Minimum bitrate (kbps)",
                note: "Lowest bitrate compression will be allowed to go, will start to limit time to ensure the bitrate is kept for the size"
            },
            {
                type: "textbox",
                id: "bitrateMax",
                value: "16000",
                name: "Maximum bitrate (kbps)",
                note: "Maximum bitrate to not waste time trying to encode for an insane quality"
            },
        ]
    };
    
    return !global.ZLibrary ? class {
        constructor() { this._config = config; }
        getName() { return config.info.name; }
        getAuthor() { return config.info.authors.map(a => a.name).join(", "); }
        getDescription() { return config.info.description; }
        getVersion() { return config.info.version; }
        load() {
            BdApi.showConfirmationModal("Library plugin is needed",
                [`The library plugin needed for ${config.info.name} is missing. Please click Download Now to install it.`], {
                confirmText: "Download",
                cancelText: "Cancel",
                onConfirm: () => {
                    require("request").get("https://rauenzi.github.io/BDPluginLibrary/release/0PluginLibrary.plugin.js", async (error, response, body) => {
                        if (error) return require("electron").shell.openExternal("https://betterdiscord.net/ghdl?url=https://raw.githubusercontent.com/rauenzi/BDPluginLibrary/master/release/0PluginLibrary.plugin.js");
                        await new Promise(r => require("fs").writeFile(require("path").join(BdApi.Plugins.folder, "0PluginLibrary.plugin.js"), body, r));
                    });
                }
            });
        }
        start() { }
        stop() { }
    } : (([Plugin, Api]) => {
        const plugin = (Plugin, Api) => {

            const {DiscordModules: {React, DiscordConstants}, Utilities, WebpackModules, PluginUtilities, DiscordModules, DiscordClasses, Patcher, Logger, Toasts} = Api;
            const PromptToUpload = WebpackModules.getByProps("promptToUpload");
            const ChatLayer = WebpackModules.find(m => m.default?.displayName == "ChatLayer");
            const presentBar = BdApi.findModuleByProps("jumpToPresentBar").jumpToPresentBar;

            const {spawn} = require('child_process');
            const fs = require('fs');
            const path = require('path');
            const os = require('os');

            const localFolder = path.join(__dirname, "encoder");
            const ffmpegPath = path.join(localFolder, "ffmpeg\\bin");

            const encodeType = {
                video: "video",
                audio: "audio",
                image: "image"
            }

            class TimeStampInputText extends React.Component {
                constructor(props) {
                    super(props)
            
                    this.state = {
                        note: props.note,
                        onClickSide: props.onClickSide,
                        onChange: props.onChange,
                        sideText: props.sideText,
                    }
                }
            
                SetError(val) {
                    this.setState({'error': !!val});
                }
            
                render(){
                    let childrenList = [
                        React.createElement('div', {
                            className: 'timestampInputTextNote'
                        }, this.state.note),
                        React.createElement(ZLibrary.DiscordModules.Textbox, {
                            value: this.props.value,
                            onChange: (e) => {
                                this.state.onChange(this, e);
                            }
                        }),
                    ];
            
                    if (this.state.sideText != undefined){
                        childrenList.push(React.createElement('div', {
                            className: 'timestampInputTextbox',
                            onClick: (e) => {
                                this.state.onClickSide(this, e);
                            }
                        }, this.state.sideText));
                    }
            
                    let className = 'timestampInputDiv';
                    if (this.state.error){
                        className += ' timestampInputDivError';
                    }
                    return React.createElement('div', {className: className, children: childrenList});
                }
            }

            class transcodeProgress extends React.Component {
                constructor(props) {
                    super(props)
            
                    this.state = {
                        _this: props._this, 
                        totalTime: 0,
                        progress: {
                            pass: 0, 
                            passCount: 0, 
                            fps: 0,
                            bitrate: 0,
                            out_time: "00:00",
                            out_time_ms: 0,
                            frame: 0,
                            speed: 0,
                            progress: 'start',
                            trimming: false,
                        },
                        func: this.progressUpdate.bind(this),
                    }

                    if (this.state._this.encodeQueue.length > 0){
                        this.state.progress = this.state._this.encodeQueue[0].progress
                    }
                }

                componentDidMount() {
                    this.state._this.encodeUpdate.add(this.state.func);
                }

                componentWillUnmount() {
                    this.state._this.encodeUpdate.delete(this.state.func);
                }

                progressUpdate(id, progress, isEnd){
                    if (this.state._this.encodeQueue.length > 0 && this.state._this.encodeQueue[0].id == id){
                        this.setState({progress: progress, totalTime: this.state._this.encodeQueue[0].endTime - this.state._this.encodeQueue[0].startTime });
                    }
                    else {
                        this.setState({latest: progress});
                    }
                }

            
                render(){
                    let perc = undefined;
                    if (this.state.progress != undefined){
                        if (this.state.progress.out_time_ms != undefined && this.state.totalTime > 0){
                            perc = Math.round(this.state.progress.out_time_ms / 10000 / this.state.totalTime);
                        }
                        else if (this.state._this.encodeQueue.length > 0 && this.state._this.encodeQueue[0].encodeType == encodeType.image){
                            if (this.state.progress.out_time_ms >= 1000){
                                perc = 100;
                            } else {
                                perc = 0;
                            }
                        }
                    }

                    if (this.state.progress == undefined) {
                        this.state.progress = {};
                    }

                    let headerList = [
                        React.createElement('div', {
                            className: '',
                            children: [
                                React.createElement('span', {}, `${this.state._this.encodeQueue.length} left`),
                                React.createElement('span', {}, `${perc ? perc : 0}%`)
                            ]
                        }),
                        React.createElement('progress', {value: perc, max: 100, className: 'transcoderProgressBar'})
                    ];

                    let bodyList = [
                        React.createElement('p', {}, `Bitrate: ${this.state.progress.bitrate}`),
                        React.createElement('p', {}, `Fps: ${this.state.progress.fps}`),
                        React.createElement('p', {}, `Speed: ${this.state.progress.speed}`),
                        React.createElement('p', {}, `Time: ${this.state.progress.out_time}`),
                        React.createElement('p', {}, `Size: ${formatBytes(this.state.progress.total_size)}`),
                        React.createElement('p', {}, `Frames: ${this.state.progress.frame}`)
                    ];

                    let Button = ZLibrary.WebpackModules.getByProps('Button').Button;

                    let childrenList = [
                        React.createElement('div', {className: "transcoderHeaderProgress", onClick: (e) => {
                            let current = e.target;
                            while (current != undefined){
                                if (current.classList.contains('transcoder-collapsible')){
                                    current.classList.toggle('expanded');
                                    break;
                                }
                                current = current.parentNode;

                            }
                            }, children: headerList}),
                        React.createElement('div', {className: "transcoderBodyProgress", children: bodyList}),
                        React.createElement('div', {className: "transcoderActionsProgress", children: [
                            React.createElement('div', {children: [
                                React.createElement(
                                    Button,
                                    {
                                        className: `TranscoderCancelButton`,
                                        onClick: () => {
                                            if (this.state._this.encodeQueue.length > 0 && this.state._this.encodeQueue[0].started && !this.state._this.encodeQueue[0].cancelled){
                                                this.state._this.encodeQueue[0].cancel();
                                                Logger.info("Cancelling encode");
                                            }
                                        },
                                    },
                                    'Cancel'
                                ),
                            ]}),
                        ]}),
                    ]
            
                    return React.createElement('div', {className: "transcodeDiv", children: [
                        React.createElement('div', {className: presentBar + " transcoder-collapsible" + (this.state._this.encodeQueue.length > 0 ? "" : " hidden"), children: childrenList})
                    ]});
                }
            }

            function toTimeFormat(input, decimals = 2){
                if (input > 0){
                    let seconds = input % 60;
                    if (decimals > 0){
                        seconds = +seconds.toFixed(decimals);
                    }
            
                    if (seconds < 10){
                        seconds = "0" + seconds;
                    }
            
                    return String(Math.floor(input/60)).padStart(2,'0') + ':' + seconds;
                }
                return '00:00';
            }
            
            // Only validly converts hh:mm:ss.ms and mm:ss.ms or ss.ms
            function timeFormatToNumber(input){
                if (input.trim() == ""){
                    return NaN;
                }

                let total = 0;
                for (let strnum of input.split(':')) {
                    total *= 60;
                    total += Number(strnum);
                }
            
                return total;
            }

            function formatBytes(bytes, decimals = 2) {
                if (isNaN(bytes)){
                    return 'N/A';
                }
                if (bytes === 0) return '0 Bytes';
            
                const k = 1024;
                const dm = decimals < 0 ? 0 : decimals;
                const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB'];
            
                const i = Math.floor(Math.log(bytes) / Math.log(k));
            
                return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
            }

            class videoEditor extends BdApi.React.Component {
                constructor(props) {
                    super(props);

                    this.state = {
                        _this: props._this,
                        metadata: props.metadata,
                        file: props.file,
                        url: URL.createObjectURL(props.file),
                        isHEVC: props.isHEVC,
                        startTime: "00:00",
                        endTime: toTimeFormat(props.metadata.format.duration, 3),
                        maxTime: props.maxTime,
                        FileSize: formatBytes(props.filesize) + "~",
                        calculateBitRate: props.calculateBitRate,
                        mergeAudio: true,
                        codec: props._this.settings.codec,
                    };
        
                    this.props.startTime = 0;
                    this.props.endTime = this.state.metadata.format.duration;
                    this.props.mergeAudio = true;

                    if (this.state.maxTime > 0 && this.props.endTime > this.state.maxTime){
                        this.state.endTime = toTimeFormat(this.state.maxTime, 3);
                        this.props.endTime = this.state.maxTime;
                    }
                }
        
                componentWillUnmount() {
                    URL.revokeObjectURL(this.state.url);
                }
            
                render() {
                    let items = [];
                    if (this.state.isHEVC) {
                        items.push("HEVC is not supported for the preview player");
                    }

                    let start = React.createElement(TimeStampInputText, {note: "Start", sideText: "T", value: this.state.startTime, onClickSide: (comp, e) => {
                        let vidPlayer = document.getElementById('transcoderPreviewVid');
                        if (vidPlayer != undefined){
                            let adjustedEnd = this.state.metadata.format.duration;
                            if (!isNaN(this.props.endTime) && this.props.endTime > adjustedStart && this.props.endTime <= this.state.metadata.format.duration){
                                adjustedEnd = this.props.endTime;
                            }

                            this.props.startTime = vidPlayer.currentTime;
                            this.setState({startTime: toTimeFormat(this.props.startTime)});

                            if (this.state.maxTime > 0 && (this.props.startTime + this.state.maxTime < adjustedEnd || this.props.startTime >= adjustedEnd)){
                                this.props.endTime = Math.min(this.props.startTime + this.state.maxTime, this.state.metadata.format.duration);
                                this.setState({endTime: toTimeFormat(this.props.endTime, 3)});
                            }
                        }
                    }, onChange: (comp, e) => {
                        e = e.trim();

                        this.setState({startTime: e});
                        let timeDec = timeFormatToNumber(e);
                        if (!isNaN(timeDec) && timeDec > this.state.metadata.format.duration){
                            timeDec = this.state.metadata.format.duration;
                        }
                        comp.SetError(e != "" && (isNaN(timeDec) || timeDec < 0));
                        this.props.startTime = timeDec;

                        let adjustedEnd = this.state.metadata.format.duration;
                        if (!isNaN(this.props.endTime) && this.props.endTime > adjustedStart && this.props.endTime <= this.state.metadata.format.duration){
                            adjustedEnd = this.props.endTime;
                        }

                        if (!isNaN(timeDec) && this.state.maxTime > 0 && (timeDec + this.state.maxTime < adjustedEnd || timeDec >= adjustedEnd)){
                            this.props.endTime = Math.min(timeDec + this.state.maxTime, this.state.metadata.format.duration);
                            this.setState({endTime: toTimeFormat(this.props.endTime, 3)});
                        }
                    }});

                    let end = React.createElement(TimeStampInputText, {note: "End", sideText: "T", value: this.state.endTime, onClickSide: (comp, e) => {
                        let vidPlayer = document.getElementById('transcoderPreviewVid');
                        if (vidPlayer != undefined){
                            let adjustedStart = 0;
                            if (!isNaN(this.props.startTime) && this.props.startTime > 0){
                                adjustedStart = this.props.startTime;
                            }

                            this.props.endTime = vidPlayer.currentTime;
                            this.setState({endTime: toTimeFormat(this.props.endTime)});

                            if (this.state.maxTime > 0 && (this.props.endTime - this.state.maxTime > adjustedStart || this.props.endTime <= adjustedStart)){
                                this.props.startTime = Math.max(this.props.endTime - this.state.maxTime, 0);
                                this.setState({startTime: toTimeFormat(this.props.startTime, 3)});
                            }
                        }
                    }, onChange: (comp, e) => {
                        e = e.trim();
        
                        this.setState({endTime: e});

                        let timeDec = timeFormatToNumber(e);
                        let adjustedStart = 0;
                        if (!isNaN(this.props.startTime) && this.props.startTime > 0){
                            adjustedStart = this.props.startTime;
                        }

                        comp.SetError(isNaN(timeDec) || timeDec < 0 || timeDec <= adjustedStart);
                        this.props.endTime = timeDec;

                        if (!isNaN(timeDec) && this.state.maxTime > 0 && (timeDec - this.state.maxTime > adjustedStart || timeDec <= adjustedStart)){
                            this.props.startTime = Math.max(timeDec - this.state.maxTime, 0);
                            this.setState({startTime: toTimeFormat(this.props.startTime, 3)});
                        }
                    }});

                    let adjustedStart = 0;
                    if (!isNaN(this.props.startTime) && this.props.startTime > 0){
                        adjustedStart = this.props.startTime;
                    }

                    let adjustedEnd = this.state.metadata.format.duration;
                    if (!isNaN(this.props.endTime) && this.props.endTime > adjustedStart && this.props.endTime <= this.state.metadata.format.duration){
                        adjustedEnd = this.props.endTime;
                    }

                    let totalTime = adjustedEnd - adjustedStart;
                    let timeRatio = totalTime/this.state.maxTime;
                    if (isNaN(timeRatio)){
                        timeRatio = 0;
                    } else if (timeRatio > 1){
                        timeRatio = 1;
                    } else if (timeRatio < 0){
                        timeRatio = 0;
                    }
                    let lerpColour = Math.min(Math.round((1 - Math.pow(timeRatio, 2)) * 50), 50);

                    let durationdiv = React.createElement('div', {className: "transcoderDurationDiv",children: [
                        React.createElement('span', {style: {color: `hsl(${lerpColour}, 100%, ${lerpColour + 50}%)`}}, toTimeFormat(totalTime, 2)),
                        React.createElement('span', {}, this.state.calculateBitRate(totalTime)),
                        React.createElement('span', {}, this.state.FileSize),
                    ]});
        
                    items.push(React.createElement('video', {width: "100%", height: 230, controls: true, id: "transcoderPreviewVid", disablePictureInPicture: true, controlslist: 'nodownload', src: this.state.url}));
                    items.push(React.createElement('div', {className: "trimDiv",children: [start, durationdiv, end]}));
                    items.push(React.createElement('div', {className: DiscordClasses.Dividers.divider + " " + DiscordClasses.Dividers.dividerDefault}));
                    items.push(React.createElement(DiscordModules.SwitchRow, {className: DiscordClasses.Dividers.dividerDefault, children: "Merge audio", disabled: this.state.metadata.audioStreamsCount < 2,note: "", onChange: () => {this.props.mergeAudio = !this.state.mergeAudio; this.setState({mergeAudio: !this.state.mergeAudio})}, value: this.state.mergeAudio}));
                    items.push(React.createElement(DiscordModules.Dropdown, {
                        value: this.state.codec,
                        onChange: (value, _) => {
                            this.setState({codec: value})
                            this.state._this.settings.codec = value;
                            PluginUtilities.saveSettings(this.state._this.settings);
                        },
                        options: [
                            { label: 'H264', value: 'libx264' },
                            { label: 'VP9', value: 'libvpx-vp9' }
                        ]
                    }));
                            
                    return React.createElement("div", {children: items});
                }
            }

            return class Transcoder extends Plugin {
                encodeQueue = [];
                encodeUpdate = new Set();
                hasLocalFFMPEG = false;

                constructor() {
                    super();
                }

                getSettingsPanel() {
                    const panel = this.buildSettingsPanel();
                    panel.addListener(() => {
                        //this.forceUpdateAll();
                    });
                    return panel.getElement();
                }

                onStart() {
                    PluginUtilities.addStyle(config.info.name, this.css);

                    if (!fs.existsSync(localFolder)){
                        fs.mkdirSync(localFolder);
                    }

                    //Check if there is a local ffmpeg available
                    this.checkLocalFFMPEG().then((t) => {
                        t = false;
                        this.hasLocalFFMPEG = t;
                        if (t == false){

                            if (!fs.existsSync(path.join(localFolder, "ffmpeg"))){
                                fs.mkdirSync(path.join(localFolder, "ffmpeg"));
                            }
                    
                            if (!fs.existsSync(ffmpegPath) || !fs.existsSync(path.join(ffmpegPath, "ffmpeg.exe")) || !fs.existsSync(path.join(ffmpegPath, "ffprobe.exe"))){
                                BdApi.showConfirmationModal("Install ffmpeg", `ffmpeg is not installed and is needed for ${this.getName()}. Do you want to auto install?`, {
                                    confirmText:"Download",
                                    onConfirm: () => {
                                        this.installFFMPEG();
                                    },
                                    onCancel: () => {
                                        BdApi.alert('Install FFMPEG', 'Missing ffmpeg, download from https://www.gyan.dev/ffmpeg/builds/ \n and unpack into the opened folder');
                                        require("electron").shell.openExternal("file:///" + localFolder + "\\ffmpeg");
                                    }
                                });
                            }

                        }
                    });
                    
                    this.allPatches();
                }

                async installFFMPEG(){
                    BdApi.showToast("downloading");
                    switch (os.platform()){
                        case "win32":
                            let options = {
                                hostname: 'www.gyan.dev',
                                port: 443,
                                path: '/ffmpeg/builds/ffmpeg-release-essentials.zip',
                                method: 'GET',
                            }

                            const reqRedir = require('https').get(options, function(response) {
                                if (response.statusCode != 301 && response.statusCode != 303){
                                    return;
                                }

                                const file = fs.createWriteStream(path.join(localFolder, "ffmpeg.zip"));
                                const request = require('https').get(response.headers.location, function(response) {
                                    response.pipe(file);
                                    file.on('error', (e) => {
                                        require("electron").shell.openExternal("https://www.gyan.dev/ffmpeg/builds/ffmpeg-release-essentials.zip");
                                        require("electron").shell.openExternal("file:///" + localFolder + "\\ffmpeg");
                                    });

                                    // after download completed close filestream 
                                    file.on("finish", () => {
                                        file.close();
                                        Logger.info("Download complete");

                                        let tarspawn = spawn("tar", ["-xf", path.join(localFolder, "ffmpeg.zip"), '-C', path.join(localFolder, "ffmpeg"), '--strip-components', '1']);
                                        tarspawn.stdout.on('data', function(data) {
                                            //Do nothing
                                        });
                                    
                                        tarspawn.stdout.on('end', function() {
                                            Logger.info("Unzipping done");
                                            BdApi.showToast("FFMPEG Installed");
                                        });
                                    });
                                });
                            })
                            break;
                        default:
                            BdApi.alert('Install FFMPEG', 'FFMPEG can not be auto installed, download from https://www.gyan.dev/ffmpeg/builds/ \n and unpack into the opened folder');
                            require("electron").shell.openExternal("file:///" + localFolder + "\\ffmpeg");
                            break;
                    }
                }

                async addImageToQueue(file, quality, endCall){
                    if (file != undefined) {
                        if (isNaN(quality) || quality > 100){
                            quality = 100
                        } else if (quality < 1){
                            quality = 1
                        }

                        let item = {
                            encodeType: encodeType.image,
                            file: file,
                            started: false,
                            quality: quality,
                            log: "",
                            id: Math.random().toString(36).slice(2),
                            cancelled: false,
                            cancel: () => {},
                        }

                        item.done = (buff) => {endCall(item, buff)};
                        this.encodeQueue.push(item);
                        this.beginEncode(0);
                    }
                }

                async addVideoToQueue(file, outputPath, bitrate = 100, codec = "h264", startTime = 0, endTime = 0, twopass = false, metadata, mergeAudio, width, height, endCall){
                    if (file != undefined && endTime > 0) {
                        let item = {
                            encodeType: encodeType.video,
                            file: file,
                            outputPath: outputPath,
                            bitrate: bitrate,
                            codec: codec,
                            twopass: twopass,
                            startTime: startTime,
                            endTime: endTime,
                            duration: metadata.format.duration,
                            metadata: metadata,
                            started: false,
                            width: width,
                            height: height,
                            mergeAudio, mergeAudio,
                            log: "",
                            id: Math.random().toString(36).slice(2),
                            cancelled: false,
                            cancel: () => {},
                        }
                        item.done = () => {endCall(item)};
                        this.encodeQueue.push(item);
                        this.beginEncode(0);
                    }
                }

                async beginEncode(index){
                    if (this.encodeQueue.length <= index) return;

                    if (this.encodeQueue[index].started == false){
                        let ffmpeg = undefined;
                        let ffmpegLocation = path.join(ffmpegPath, "ffmpeg.exe");
                        if (this.hasLocalFFMPEG){
                            ffmpegLocation = "ffmpeg";
                        }

                        const id = this.encodeQueue[index].id;
                        const encodeItem = this.encodeQueue[index];
                        encodeItem.started = true;

                        const informEncode = (data, end = false) => {
                            encodeItem.progress = data;
                            this.encodeUpdate.forEach((func) => {
                                func(id, data, end);
                            })
                        };

                        let progress = {
                            pass: 1, 
                            passCount: 1, 
                            fps: 0,
                            bitrate: 0,
                            out_time: "00:00",
                            frame: 0,
                            speed: 0,
                            progress: 'start',
                            trimming: false,
                        };

                        encodeItem.cancelled = false;
                        encodeItem.cancel = () => {
                            encodeItem.cancelled = true;
                            ffmpeg?.stdin.write('q');
                        }

                        switch (encodeItem.encodeType){
                            case encodeType.image:
                                let chunks = []
                                ffmpeg = spawn(ffmpegLocation, ['-i', 'pipe:0', '-quality', encodeItem.quality, '-f', 'webp', '-progress', 'pipe:3', '-stats_period', '0.01', 'pipe:1'], {
                                    stdio: ['pipe', 'pipe', 'pipe', 'pipe']
                                });

                                ffmpeg.stdout.on('data', function(data) {
                                    chunks.push(data);
                                });

                                ffmpeg.stderr.on('data', function(data) {
                                    //console.log(data.toString());
                                });

                                ffmpeg.stdio[3].on('data', function(data) {
                                    let tLines = data.toString().split('\n');
                                    for (let i = 0; i < tLines.length; i++) {
                                        let key = tLines[i].split('=');
                                        if (typeof key[0] != 'undefined' && typeof key[1] != 'undefined') {
                                            progress[key[0]] = key[1];
                                        }
                                    }
                    
                                    informEncode(progress);
                                });
                                informEncode(progress);

                                ffmpeg.stdout.on('end', function() {
                                    encodeItem.done(chunks);
                                });

                                let reader = encodeItem.file.stream().getReader();

                                function readStream({done, value}) {
                                    if (done){
                                        ffmpeg.stdin.end();
                                        return;
                                    }
                                    ffmpeg.stdin.cork();
                                    ffmpeg.stdin.write(value);
                                    ffmpeg.stdin.uncork();
                                    return reader.read().then(readStream);
                                }

                                reader.read().then(readStream);

                                break;
                            case encodeType.video:
                                let frameRate = 30;
                                if (!isNaN(this.settings.maxfps) && Number(this.settings.maxfps) > 1){
                                    frameRate = Number(this.settings.maxfps);
                                }

                                let input = 'pipe:0';
                                if (encodeItem.file.path.length > 0){
                                    input = encodeItem.file.path;
                                }
                                let funcArgs = ['-i', input, '-c:v', encodeItem.codec, '-b:v', `${encodeItem.bitrate}k`, '-r', frameRate];
                                if (encodeItem.codec == "libvpx-vp9"){
                                    funcArgs.push('-row-mt');
                                    funcArgs.push('1');
                                    funcArgs.push('-cpu-used');
                                    funcArgs.push('3');
                                }

                                if (!isNaN(encodeItem.startTime) && encodeItem.startTime > 0){
                                    funcArgs.unshift(toTimeFormat(encodeItem.startTime));
                                    funcArgs.unshift('-ss');

                                    if (!isNaN(encodeItem.endTime) && encodeItem.endTime > encodeItem.startTime && encodeItem.duration >= encodeItem.endTime){
                                        funcArgs.push('-t');
                                        funcArgs.push(toTimeFormat(encodeItem.endTime - encodeItem.startTime));
                                    }
                                }
                                else if (!isNaN(encodeItem.endTime) && encodeItem.endTime > 0 && encodeItem.duration >= encodeItem.endTime){
                                    funcArgs.push('-t');
                                    funcArgs.push(toTimeFormat(encodeItem.endTime));
                                }
                                
                                if (!isNaN(encodeItem.width) && Number(encodeItem.width) > 0 && Number(encodeItem.width) < encodeItem.metadata.video_width){
                                    funcArgs.push('-vf');
                                    funcArgs.push(`scale=${Number(encodeItem.width)}:-1:flags=bicubic`);
                                } else if (!isNaN(encodeItem.height) && Number(encodeItem.height) > 0 && Number(encodeItem.height) < encodeItem.metadata.video_height){
                                    funcArgs.push('-vf');
                                    funcArgs.push(`scale=-1:${Number(encodeItem.height)}:flags=bicubic`);
                                }

                                if (false && encodeItem.twopass){
                                    progress.passCount = 2;

                                    informEncode(progress);
                                    encodeItem.done();
                                }
                                else{

                                    if (encodeItem.metadata.audioStreamsCount > 1 && encodeItem.mergeAudio){
                                        let audioParams = "";
                                        for (let index = 0; index < encodeItem.metadata.audioStreamsCount; index++) {
                                            audioParams += `[0:a:${index}]`;
                                        }
                                        audioParams += "amix=" + encodeItem.metadata.audioStreamsCount + ":longest:weights=";
                                        for (let index = 0; index < encodeItem.metadata.audioStreamsCount; index++) {
                                            audioParams += "1 ";
                                        }
                                        audioParams += "[aout]";

                                        funcArgs = funcArgs.concat(['-filter_complex' ,audioParams, '-map', '0:V:0', '-map', '[aout]']);
                                    }

                                    ffmpeg = spawn(ffmpegLocation, funcArgs.concat(['-c:a', 'libopus', '-b:a', '64k', '-movflags', '+faststart', '-y', '-progress', 'pipe:1', '-stats_period', '0.1', '-passlogfile', path.join(localFolder, "ffmpegpass0.txt"), encodeItem.outputPath]), )
                                    
                                    informEncode(progress);
                        
                                    ffmpeg.stdout.on('data', function(data) {
                        
                                        let tLines = data.toString().split('\n');
                                        for (let i = 0; i < tLines.length; i++) {
                                            let key = tLines[i].split('=');
                                            if (typeof key[0] != 'undefined' && typeof key[1] != 'undefined') {
                                                progress[key[0]] = key[1];
                                            }
                                        }
                        
                                        informEncode(progress);
                                    });

                                    /* //example
                                        bitrate: "1836.5kbits/s"
                                        drop_frames: "1016"
                                        dup_frames: "0"
                                        fps: "71.83"
                                        frame: "1020"
                                        out_time: "00:00:34.007229"
                                        out_time_ms: "34007229"
                                        out_time_us: "34007229"
                                        pass: 1
                                        passCount: 1
                                        progress: "end"
                                        speed: "2.39x"
                                        stream_0_0_q: "-1.0"
                                        total_size: "7806674"
                                        trimming: false
                                    */
                        
                                    ffmpeg.stderr.on("data", data => {
                                        encodeItem.log += data.toString();
                                        //console.log(`stderr: ${data}`);
                                    });
                                
                                    ffmpeg.stdout.on('end', function() {
                                        encodeItem.done();
                                    });

                                    if (encodeItem.file.path.length <= 0){
                                        let reader = encodeItem.file.stream().getReader();

                                        function readStream({done, value}) {
                                            if (done){
                                                ffmpeg.stdin.end();
                                                return;
                                            }
                                            ffmpeg.stdin.cork();
                                            ffmpeg.stdin.write(value);
                                            ffmpeg.stdin.uncork();
                                            return reader.read().then(readStream);
                                        }

                                        reader.read().then(readStream);
                                    }
                                }

                                break;
                        }
                    }
                }


                async allPatches(){
                    //patch upload
                    if (PromptToUpload != undefined){
                        Patcher.instead(PromptToUpload, "promptToUpload", this.uploadpatch.bind(this));
                    }
                    else{
                        Logger.err("Failed to patch file upload");
                    }

                    if (ChatLayer != undefined){
                        Patcher.after(ChatLayer, "ChatLayerProvider", (_, args, ret) => {this.patchChat(_, args, ret, this)});
                    }
                    else{
                        Logger.err("Failed to patch chat layer");
                    }
                }

                

                onStop() {
                    PluginUtilities.removeStyle(config.info.name);
                    Patcher.unpatchAll();
                }

                checkLocalFFMPEG(){
                    return new Promise((resolve, error) => {
                        let str = "";
                        let ffprobe = spawn("ffmpeg", ['-version'], )
                        ffprobe.stdout.on('data', function(data) {
                            str += data;
                        });
                    
                        ffprobe.stdout.on('end', function() {
                            resolve(str.startsWith('ffmpeg version'));
                        });
                    })
                }
            
                patchChat(_, args, ret, _this) {
            
                    if (ret.props.children != undefined){
                        let chatContent = BdApi.findModuleByProps("chat", "chatContent").chatContent;
                        for (let child of ret.props.children.props.children) {
                            if (child.props.className == chatContent){
                                let container = React.createElement(transcodeProgress, {_this: this});
                                
                                //Place before the textarea
                                let index = 0;
                                for (index = 0; index < child.props.children.length; index++) {
                                    if (child.props.children[index].type == "form"){
                                        break;
                                    }
                                }
            
                                child.props.children.splice(index, 0, container);
                                break;
                            }
                        }
                    }
                }
            
                uploadpatch(_, args, originalFunction) {
                    try {
                        let files = args[0];

                        let total_size = 0;
                        let hasImage = false;
                        for (let file of files) {
                            if (file.type.startsWith('image/') && file.type != "image/gif"){
                                hasImage = true;
                            }
                            total_size += file.size;
                        }

                        if (hasImage && total_size > this.getMaxFileSize()){
                            Toasts.info("Files to large, compressing images");
                        }

                        if (files.length == 1 && files[0].type.startsWith("video/") && files[0].path && files[0].path != ""){
                            BdApi.showToast('Loading video');
                            this.getvideoFileMeta(files[0], (metaRaw) => {
                                let metadata = {};
                                try{
                                    metadata = JSON.parse(metaRaw);
                                    metadata.format.duration = Number(metadata.format.duration);
                                }
                                catch(err){
                                    Logger.err(err);
                                    Toasts.error("Failed to read video data");

                                    //Attempt to add the file regardless - incase its other programs messing with it
                                    originalFunction( ...args);
                                    return;
                                }

            
                                let has_HEVC = false;
                                metadata.audioStreamsCount = 0;
                                for (let stream of metadata.streams) {
                                    if (stream.codec_type == "video"){
                                        metadata.video_height = Number(stream.coded_height);
                                        metadata.video_width = Number(stream.coded_width);
                                        if (stream.codec_name == "hevc"){
                                            has_HEVC = true;
                                        }
                                    }
                                    if (stream.codec_type == "audio"){
                                        metadata.audioStreamsCount++;
                                    }
                                }
            
                                //File needs to be transcoded to send
                                if (files[0].size > this.getTargetFileSize() || has_HEVC){
                                    let editorprompt = React.createElement(videoEditor, {
                                        metadata: metadata,
                                        isHEVC: has_HEVC,
                                        file: files[0],
                                        filesize: this.getTargetFileSize(),
                                        maxTime: this.calculateMaxtime(),
                                        _this: this,
                                        calculateBitRate: this.calculateBitRate.bind(this),
                                    });
            
                                    BdApi.showConfirmationModal("Transcode video", editorprompt, {
                                        confirmText:"Encode",
                                        onConfirm: () => {
                                            let adjustedStart = 0;
                                            if (!isNaN(editorprompt.props.startTime) && editorprompt.props.startTime > 0 && editorprompt.props.startTime < metadata.format.duration){
                                                adjustedStart = editorprompt.props.startTime;
                                            }

                                            let adjustedEnd = metadata.format.duration;
                                            if (!isNaN(editorprompt.props.endTime) && editorprompt.props.endTime > adjustedStart && editorprompt.props.endTime <= adjustedStart + this.calculateMaxtime() && editorprompt.props.endTime < metadata.format.duration - 0.1){
                                                adjustedEnd = editorprompt.props.endTime;
                                            }                                            

                                            this.addVideoToQueue(files[0], path.join(localFolder, "tmp.mp4"), this.calculateBitRate(adjustedEnd - adjustedStart), this.settings.codec, adjustedStart, adjustedEnd, this.settings.twoPassEncode, metadata, editorprompt.props.mergeAudio, this.settings.maxWidth, this.settings.maxHeight, (item) => {
                                                if (!item.cancelled){
                                                    Logger.info(`Transcode complete - ${files[0].name}` )
                                                    try{
                                                        let newFileName = path.basename(item.file.name, path.extname(item.file.name)) + '.mp4'
    
                                                        args[0] = [
                                                            new File([fs.readFileSync(item.outputPath, { flag: "r" })], newFileName, {
                                                                path: item.outputPath,
                                                                type: "video/mp4"
                                                            })
                                                        ]
                                                        originalFunction( ...args);
                                                    }
                                                    catch(err){
                                                        Logger.err(err);
                                                    }
                                                }

                                                //Increase wait if failed
                                                let wait = 0;
                                                if (item.progress.out_time_ms < (item.endTime - item.startTime) * 1000 - 100){
                                                    wait = 5000;
                                                }

                                                //Remove item from queue
                                                setTimeout(() => {
                                                    this.encodeQueue = this.encodeQueue.filter((encodeItem) => encodeItem.id != item.id)
                                                    this.encodeUpdate.forEach((func) => {
                                                        func(item.id, {removed: true}, true);
                                                    })
                                                    this.beginEncode(0);
                                                }, wait);
                                            });
                                        },
                                        onCancel: () => {
                                            console.log("cancelled");
                                        }
                                    });
                                }
                                else {
            
                                    //Change file extension to embed
                                    if (this.settings.renameFileExt && !files[0].path.endsWith(".mp4")) {
                                        try{
                                            let newFileName = path.basename(files[0].name, path.extname(files[0].name)) + '.mp4';
                    
                                            let newFile = new File([files[0]], newFileName, {
                                                type: "video/mp4"
                                            });
                    
                                            args[0] = [newFile];
                                        }
                                        catch(err){
                                            Logger.err(err);
                                        }
                                    }
            
                                    originalFunction( ...args);
                                }
                            });
                        }
                        else if (this.settings.compressImages || (hasImage && total_size > this.getMaxFileSize())){
                            let newFiles = [];
                            let count = 0;

                            for (let file of files) {
                                if (file.type.startsWith('image/') && file.type != "image/gif"){
                                    this.addImageToQueue(file, this.settings.imageQuality, (item, data) => {
                                        Logger.info("finished transcoding image " + item.file.name);

                                        count -= 1;
                                        let newFileName = path.basename(item.file.name, path.extname(item.file.name)) + '.webp';

                                        //Sometimes ffmpeg doesn't set the file size header correctly

                                        let totaldata = Buffer.concat(data);
                                        if (totaldata.length > 12){
                                            if (totaldata[4] == 0 && totaldata[5] == 0 && totaldata[6] == 0 && totaldata[7] == 0){
                                                totaldata = totaldata.copyWithin(4, -4).slice(0, -4);
                                            }
                                            
                                            newFiles.push(new File([totaldata], newFileName, {
                                                type: "image/webp"
                                            }));
                                        } else {
                                            Toasts.error('Error compressing ' + item.file.name);
                                            Logger.err("Transcoding " + item.file.name + " Failed, passing original");

                                            //Pass on the original
                                            newFiles.push(item.file);
                                        }


                                        setTimeout(() => {
                                            this.encodeQueue = this.encodeQueue.filter((encodeItem) => encodeItem.id != item.id)
                                            this.encodeUpdate.forEach((func) => {
                                                func(item.id, {removed: true}, true);
                                            });
                                            this.beginEncode(0);
                                        }, item.cancelled || totaldata.length <= 12 ? 5000 : 100);

                                        if (count == 0){
                                            args[0] = newFiles;
                                            originalFunction( ...args);
                                        }
                                    });
                                    count++;
                                }
                                else{
                                    newFiles.push(file);
                                }
                            }

                            if (count <= 0){
                                originalFunction( ...args);
                            } else {
                                Toasts.info(`Compressing ${count} images`);
                            }
                        }
                        else {
                            originalFunction( ...args);
                        }
                    }
                    catch(err){
                        Logger.err(err);
                    }
                    
                }
            
                getvideoFileMeta(file, callback){
                    let str = "";
                    let ffmpegLoc = path.join(ffmpegPath, "ffprobe.exe");
                    if (this.hasLocalFFMPEG){
                        ffmpegLoc = "ffprobe";
                    }

                    let input = 'pipe:0';
                    if (file.path.length > 0){
                        input = file.path
                    }
            
                    let ffprobe = spawn(ffmpegLoc, ['-print_format', 'json', '-loglevel', '0', '-show_format', '-show_streams', input], )
                    ffprobe.stdout.on('data', function(data) {
                        str += data;
                    });
                
                    ffprobe.stdout.on('end', function() {
                        callback(str);
                    });

                    if (file.path.length <= 0){
                        let reader = file.stream().getReader();

                        function readStream({done, value}) {
                            if (done){
                                ffprobe.stdin.end();
                                return;
                            }
                            ffprobe.stdin.cork();
                            ffprobe.stdin.write(value);
                            ffprobe.stdin.uncork();
                            return reader.read().then(readStream);
                        }

                        reader.read().then(readStream);
                    }
                }
            
                getMaxFileSize(){
                    let sizeModule = BdApi.findModuleByProps('maxFileSize');
                    if (sizeModule != undefined){
                        return sizeModule.maxFileSize();
                    }
                    return 0;
                }
            
                getTargetFileSize(){
                    if (isNaN(this.settings.targetFileSize) || this.settings.targetFileSize <= 0){
                        return this.getMaxFileSize();
                    }
            
                    return Math.min(this.settings.targetFileSize * 1024 * 1024, this.getMaxFileSize());
                }

                calculateBitRate(totalTime, targetSize = this.getTargetFileSize(), overheadFactor = 0.96){
                    if (!isNaN(this.settings.targetMultipler) && Number(this.settings.targetMultipler) > 0){
                        overheadFactor = this.settings.targetMultipler;
                    }
                    let max = 0;
                    if (!isNaN(this.settings.bitrateMax) && Number(this.settings.bitrateMax) > 0){
                        max = Number(this.settings.bitrateMax)
                    }

                    return Math.min(Math.floor(targetSize * overheadFactor / (128 * totalTime) - 64), max);
                }

                calculateMaxtime(targetSize = this.getTargetFileSize(), overheadFactor = 0.96){
                    if (!isNaN(this.settings.targetMultipler) && Number(this.settings.targetMultipler) > 0){
                        overheadFactor = this.settings.targetMultipler;
                    }

                    let bitRateMin = 100;
                    if (!isNaN(this.settings.bitrateMin) && Number(this.settings.bitrateMin) > 100){
                        bitRateMin = Number(this.settings.bitrateMin);
                    }

                    return Math.floor(targetSize * overheadFactor / (bitRateMin + 64) / 128);
                }

                css = `

                    .transcodeDiv {
                        margin: 0 16px;
                        height: 0 !important;
                        position: relative;
                    }

                    .transcodeDiv>div {
                        left: 0;
                        right: 0;
                        display:flex;
                        padding: 0 4px 4px 4px;
                        flex-direction: column;
                    }

                    .timestampInputDiv {
                        display: flex;
                        margin: 2px;
                        color: white;
                        width: fit-content;
                    }

                    .timestampInputDivError {
                        color: red;
                    }

                    .TranscoderCancelButton {
                        height: 34px;
                        width: 100px;
                        min-height: 34px;
                        min-width: 100px;
                    }

                    .timestampInputDiv div input {
                        width: 100px;
                        color: white;
                    }

                    .timestampInputDivError div input {
                        color: red;
                    }

                    .timestampInputTextNote{
                        padding: 10px;
                        margin-right: -2px;
                        display: flex;
                        flex-direction: column;
                        justify-content:center;
                        background: #2f3136;
                        border-radius: 5px 0 0 5px;
                        z-index: 0;
                    }

                    .trimDiv{
                        display: flex;
                        justify-content: space-between;
                        align-items: center;
                    }

                    .timestampInputTextbox{
                        min-width: 20px;
                        margin-left: -2px;
                        display: flex;
                        flex-direction: column;
                        cursor: pointer;
                        justify-content:center;
                        align-items: center;
                        background: #2f3136;
                        border-radius: 0 5px 5px 0;
                    }

                    .transcoderDurationDiv{
                        display: flex;
                        justify-content: center;
                        flex-direction: column;
                        align-items: center;
                    }

                    .transcoderProgressBar {
                        width: 98%;
                    }

                    .transcoderHeaderProgress :first-child{
                        width: 80px;
                        display: flex;
                        justify-content: space-between;
                        padding: 0 4px;
                    }

                    .transcoder-collapsible {
                        transition: max-height .3s ease;
                        height: fit-content;
                        overflow: hidden;
                        max-height: 24px;
                    }

                    .transcoder-collapsible.expanded{
                        transition: max-height .3s ease;
                        max-height: 120px;
                    }

                    .transcoder-collapsible.hidden{
                        display: none;
                    }

                    .transcoder-collapsible>div:first-child::after {
                        content: "";
                        -webkit-mask: url(data:image/svg+xml;base64,PD94bWwgdmVyc2lvbj0iMS4wIiBlbmNvZGluZz0idXRmLTgiPz4NCjwhLS0gR2VuZXJhdG9yOiBBZG9iZSBJbGx1c3RyYXRvciAxOS4wLjAsIFNWRyBFeHBvcnQgUGx1Zy1JbiAuIFNWRyBWZXJzaW9uOiA2LjAwIEJ1aWxkIDApICAtLT4NCjxzdmcgdmVyc2lvbj0iMS4xIiBpZD0iQ2FscXVlXzEiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyIgeG1sbnM6eGxpbms9Imh0dHA6Ly93d3cudzMub3JnLzE5OTkveGxpbmsiIHg9IjBweCIgeT0iMHB4Ig0KCSB2aWV3Qm94PSItOTUwIDUzMiAxOCAxOCIgc3R5bGU9ImVuYWJsZS1iYWNrZ3JvdW5kOm5ldyAtOTUwIDUzMiAxOCAxODsiIHhtbDpzcGFjZT0icHJlc2VydmUiPg0KPHN0eWxlIHR5cGU9InRleHQvY3NzIj4NCgkuc3Qwe2ZpbGw6bm9uZTt9DQoJLnN0MXtmaWxsOm5vbmU7c3Ryb2tlOiNGRkZGRkY7c3Ryb2tlLXdpZHRoOjEuNTtzdHJva2UtbWl0ZXJsaW1pdDoxMDt9DQo8L3N0eWxlPg0KPHBhdGggY2xhc3M9InN0MCIgZD0iTS05MzIsNTMydjE4aC0xOHYtMThILTkzMnoiLz4NCjxwb2x5bGluZSBjbGFzcz0ic3QxIiBwb2ludHM9Ii05MzYuNiw1MzguOCAtOTQxLDU0My4yIC05NDUuNCw1MzguOCAiLz4NCjwvc3ZnPg0K)center/contain no-repeat;
                        mask: url(data:image/svg+xml;base64,PD94bWwgdmVyc2lvbj0iMS4wIiBlbmNvZGluZz0idXRmLTgiPz4NCjwhLS0gR2VuZXJhdG9yOiBBZG9iZSBJbGx1c3RyYXRvciAxOS4wLjAsIFNWRyBFeHBvcnQgUGx1Zy1JbiAuIFNWRyBWZXJzaW9uOiA2LjAwIEJ1aWxkIDApICAtLT4NCjxzdmcgdmVyc2lvbj0iMS4xIiBpZD0iQ2FscXVlXzEiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyIgeG1sbnM6eGxpbms9Imh0dHA6Ly93d3cudzMub3JnLzE5OTkveGxpbmsiIHg9IjBweCIgeT0iMHB4Ig0KCSB2aWV3Qm94PSItOTUwIDUzMiAxOCAxOCIgc3R5bGU9ImVuYWJsZS1iYWNrZ3JvdW5kOm5ldyAtOTUwIDUzMiAxOCAxODsiIHhtbDpzcGFjZT0icHJlc2VydmUiPg0KPHN0eWxlIHR5cGU9InRleHQvY3NzIj4NCgkuc3Qwe2ZpbGw6bm9uZTt9DQoJLnN0MXtmaWxsOm5vbmU7c3Ryb2tlOiNGRkZGRkY7c3Ryb2tlLXdpZHRoOjEuNTtzdHJva2UtbWl0ZXJsaW1pdDoxMDt9DQo8L3N0eWxlPg0KPHBhdGggY2xhc3M9InN0MCIgZD0iTS05MzIsNTMydjE4aC0xOHYtMThILTkzMnoiLz4NCjxwb2x5bGluZSBjbGFzcz0ic3QxIiBwb2ludHM9Ii05MzYuNiw1MzguOCAtOTQxLDU0My4yIC05NDUuNCw1MzguOCAiLz4NCjwvc3ZnPg0K)center/contain no-repeat;
                        background: var(--header-secondary);
                        height: 20px;
                        width: 20px;
                        position: relative;
                        display: inline-block;
                        vertical-align: bottom;
                        transition: transform .3s ease;
                        transform: rotate(90deg);
                        order: 3;
                    }

                    .transcoder-collapsible.expanded>div:first-child::after {
                        transition: transform .3s ease;
                        transform: rotate(0);
                    }

                    .transcoderHeaderProgress {
                        display: flex;
                        flex-direction: row;
                        width: 100%;
                        margin: 0 4px;
                        padding: 4px 0;
                        align-content: center;
                        align-items: center;
                        justify-content: space-between;
                    }

                    .transcoderBodyProgress {
                        width: 100%;
                        cursor: pointer;
                        display: inline-grid;
                        grid-template-columns: 2fr 1fr 1fr 2fr 1fr 1fr
                    }

                    .transcoderActionsProgress {
                        width: 100%;
                        display: flex;
                        justify-content: flex-end;
                        flex-direction: row;
                        align-items: center;
                    }
                `

            }

        };
        return plugin(Plugin, Api);
    })(global.ZeresPluginLibrary.buildPlugin(config));
})();
/*@end@*/
