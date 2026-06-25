import type { SemanticEvidenceRule } from "./semantic-evidence";

export const GENERATED_SEMANTIC_EVIDENCE_RULES: SemanticEvidenceRule[] = [
  {
    "_lineno": 23,
    "tag": "特定帧唤醒",
    "dimension": "technology",
    "strength": "nice",
    "include": [
      "CAN-FD",
      "CAN",
      "SBC"
    ],
    "exclude": [
      "LIN"
    ],
    "fields": [
      "_params",
      "_detail_intro",
      "_detail_features"
    ],
    "auto": true,
    "aliases": [
      "特定帧唤醒",
      "partial networking",
      "selective wake",
      "selective wake up",
      "selective wake-up",
      "iso 11898-6"
    ],
    "regex": "partial\\s*network|特定帧唤醒|selective\\s*wake(?:[-\\s]*up)?|ISO\\s*11898-6",
    "keywords": "partial\\s*network|selective\\s*wake|特定帧唤醒|wake[-\\s]*up.*frame|睡眠.*唤醒",
    "query_regex": "特定帧唤醒|partial[ -]?networking|selective\\s*wake(?:[-\\s]*up)?"
  },
  {
    "_lineno": 25,
    "tag": "SIC",
    "dimension": "technology",
    "strength": "nice",
    "include": [
      "CAN-FD",
      "CAN",
      "RS-485",
      "SBC"
    ],
    "fields": [
      "_params",
      "_detail_intro",
      "_detail_features"
    ],
    "auto": true,
    "aliases": [
      "SIC",
      "signal improvement capability",
      "signal improvement",
      "信号改善"
    ],
    "regex": "signal\\s*improvement\\s*capability|\\bSIC\\b|信号改善",
    "keywords": "SIC|signal\\s*improvement|信号改善|增强.*CAN|CAN.*增强",
    "query_regex": "\\bsic\\b|signal\\s*improvement|信号改善",
    "exclude": []
  },
  {
    "_lineno": 27,
    "tag": "低功耗唤醒",
    "dimension": "feature",
    "strength": "nice",
    "include": [
      "CAN-FD",
      "CAN",
      "SBC",
      "LIN"
    ],
    "fields": [
      "_params",
      "_detail_intro",
      "_detail_features"
    ],
    "auto": false,
    "aliases": [
      "低功耗唤醒",
      "low power wake",
      "wake pin",
      "inh",
      "remote wake",
      "local wake",
      "远程唤醒",
      "本地唤醒"
    ],
    "regex": "低功耗唤醒|wake\\s*pin|\\bINH\\b|remote\\s*wake|local\\s*wake|远程唤醒|本地唤醒",
    "keywords": "低功耗唤醒|wake\\s*pin|\\bINH\\b|remote\\s*wake|local\\s*wake|远程唤醒|本地唤醒|低功耗.*唤醒",
    "query_regex": "低功耗唤醒|low[ -]?power\\s*wake",
    "exclude": []
  },
  {
    "_lineno": 30,
    "tag": "低噪声",
    "dimension": "feature",
    "strength": "sort_hint",
    "include": [
      "运放",
      "比较器",
      "LDO",
      "电压基准"
    ],
    "fields": [
      "_params",
      "_detail_intro",
      "_detail_features"
    ],
    "auto": false,
    "aliases": [
      "低噪声",
      "低噪音",
      "voltage noise",
      "output noise",
      "输出噪声",
      "noise"
    ],
    "regex": "低噪声|低噪音|voltage\\s*noise|output\\s*noise|输出噪声",
    "keywords": "低噪声|低噪音|voltage\\s*noise|output\\s*noise|输出噪声|noise",
    "query_regex": "低噪声|低噪音|low[ -]?noise",
    "exclude": []
  },
  {
    "_lineno": 32,
    "tag": "高PSRR",
    "dimension": "feature",
    "strength": "sort_hint",
    "include": [
      "LDO",
      "运放"
    ],
    "fields": [
      "_params",
      "_detail_intro",
      "_detail_features"
    ],
    "auto": false,
    "aliases": [
      "高psrr",
      "psrr",
      "power supply rejection"
    ],
    "regex": "高\\s*PSRR|PSRR|power\\s*supply\\s*rejection",
    "keywords": "高\\s*PSRR|PSRR|power\\s*supply\\s*rejection|电源抑制",
    "query_regex": "高psrr|高电源抑制|高\\s*PSRR",
    "exclude": []
  },
  {
    "_lineno": 34,
    "tag": "轨到轨",
    "dimension": "technology",
    "strength": "must",
    "include": [
      "运放",
      "比较器"
    ],
    "exclude": [
      "角度编码器"
    ],
    "fields": [
      "_params",
      "_detail_intro",
      "_detail_features"
    ],
    "auto": true,
    "aliases": [
      "轨到轨",
      "rail-to-rail",
      "rail to rail",
      "rail-rail",
      "RRIO",
      "RRI"
    ],
    "regex": "轨到轨(?:输入|输出|输入/输出)?|rail[\\s\\-]*to[\\s\\-]*rail\\s*(?:input|output)?\\s*[:：]?\\s*(?:yes|to\\s*vss|to\\s*vdd|input|output)?|rail[\\s\\-]*rail\\s*(?:in|out)\\s*[:：]?\\s*yes|\\bRRIO\\b",
    "keywords": "轨到轨输入|轨到轨输出|轨到轨输入/输出|rail[\\s\\-]*to[\\s\\-]*rail\\s*(?:input|output)|rail[\\s\\-]*rail\\s*(?:in|out)|\\bRRIO\\b",
    "query_regex": "轨到轨|rail[ -]?to[ -]?rail|rail[ -]?rail"
  },
  {
    "_lineno": 36,
    "tag": "霍尔",
    "dimension": "technology",
    "strength": "must",
    "include": [
      "电流传感器",
      "位置传感器"
    ],
    "fields": [
      "_params",
      "_detail_intro",
      "_detail_features"
    ],
    "auto": true,
    "aliases": [
      "霍尔",
      "hall effect",
      "linear hall",
      "hall plate",
      "霍尔效应",
      "平面霍尔"
    ],
    "regex": "霍尔|线性霍尔|霍尔效应|平面霍尔|霍尔传感器IC|霍尔传感器芯片|hall\\s*effect|linear\\s*hall|hall\\s*plate|灵敏度.*Gs|灵敏度.*高斯",
    "keywords": "霍尔|hall\\s*effect|hall\\s*plate|hall\\s*sens|线性霍尔|平面霍尔|高斯|Gs\\/|mV\\/Gs|磁通密度|magnetic\\s*flux",
    "query_regex": "霍尔|hall\\s*effect|linear\\s*hall",
    "exclude": []
  },
  {
    "_lineno": 38,
    "tag": "磁阻",
    "dimension": "technology",
    "strength": "must",
    "include": [
      "电流传感器",
      "位置传感器",
      "角度编码器"
    ],
    "fields": [
      "_params",
      "_detail_intro",
      "_detail_features"
    ],
    "auto": true,
    "aliases": [
      "磁阻",
      "TMR",
      "AMR",
      "magnetoresistive",
      "anisotropic magneto"
    ],
    "regex": "TMR|AMR|磁阻|magnetoresistive|anisotropic\\s*magneto",
    "keywords": "TMR|AMR|GMR|磁阻|magnetoresistive|xMR|惠斯通|wheatstone.*bridge|各向异性",
    "query_regex": "磁阻|TMR|AMR|magnetoresistive",
    "exclude": []
  },
  {
    "_lineno": 41,
    "tag": "非管理型",
    "dimension": "feature",
    "strength": "nice",
    "include": [
      "交换机"
    ],
    "fields": [
      "_params",
      "_detail_intro",
      "_detail_features"
    ],
    "auto": false,
    "aliases": [
      "非管理型",
      "unmanaged"
    ],
    "regex": "非管理型|unmanaged",
    "keywords": "非管理型|unmanaged",
    "query_regex": "非管理型|unmanaged",
    "exclude": []
  },
  {
    "_lineno": 43,
    "tag": "千兆",
    "dimension": "media",
    "strength": "must",
    "include": [
      "交换机",
      "网卡",
      "以太网"
    ],
    "fields": [
      "_params",
      "_detail_intro",
      "_detail_features"
    ],
    "auto": true,
    "aliases": [
      "千兆",
      "gigabit",
      "1ge",
      "5ge",
      "1000base"
    ],
    "regex": "千兆|gigabit|1GE|5GE|1000base",
    "keywords": "千兆|gigabit|1GE|5GE|1000base",
    "query_regex": "千兆|ge[ -]?phy|1000base",
    "exclude": []
  },
  {
    "_lineno": 44,
    "tag": "全双工",
    "dimension": "media",
    "strength": "must",
    "include": [
      "RS-485",
      "隔离RS485",
      "RS-232",
      "MLVDS"
    ],
    "fields": [
      "_params",
      "_detail_intro",
      "_detail_features"
    ],
    "auto": false,
    "aliases": [
      "全双工",
      "full duplex",
      "full-duplex"
    ],
    "regex": "全双工|full[ -]?duplex",
    "keywords": "全双工|full duplex|full-duplex",
    "query_regex": "全双工|full[ -]?duplex",
    "exclude": []
  },
  {
    "_lineno": 45,
    "tag": "半双工",
    "dimension": "media",
    "strength": "must",
    "include": [
      "RS-485",
      "隔离RS485",
      "RS-232",
      "MLVDS"
    ],
    "fields": [
      "_params",
      "_detail_intro",
      "_detail_features"
    ],
    "auto": false,
    "aliases": [
      "半双工",
      "half duplex",
      "half-duplex"
    ],
    "regex": "半双工|half[ -]?duplex",
    "keywords": "半双工|half duplex|half-duplex",
    "query_regex": "半双工|half[ -]?duplex",
    "exclude": []
  },
  {
    "_lineno": 48,
    "tag": "车规AEC-Q100",
    "dimension": "grade",
    "strength": "must",
    "exclude": [
      "工业级",
      "消费级"
    ],
    "fields": [
      "_params",
      "_detail_intro",
      "_detail_features"
    ],
    "auto": true,
    "aliases": [
      "车规",
      "aec-q100",
      "q100",
      "automotive"
    ],
    "regex": "应用等级[:\\s]*车规|AEC[-\\s]*Q100|车规",
    "keywords": "应用等级[:\\s]*车规|AEC[-\\s]*Q100|车规|automotive",
    "query_regex": "车规|车载|车用|aec[ -]?q100|汽车级|汽车规格",
    "include": []
  },
  {
    "_lineno": 50,
    "tag": "工业级",
    "dimension": "grade",
    "strength": "must",
    "exclude": [
      "车规AEC-Q100",
      "消费级"
    ],
    "fields": [
      "_params",
      "_detail_intro",
      "_detail_features"
    ],
    "auto": true,
    "aliases": [
      "工业级",
      "industrial"
    ],
    "regex": "应用等级[:\\s]*工业级|工业级|industrial",
    "keywords": "应用等级[:\\s]*工业级|工业级|industrial",
    "query_regex": "工业级|industrial",
    "include": []
  },
  {
    "_lineno": 52,
    "tag": "消费级",
    "dimension": "grade",
    "strength": "must",
    "exclude": [
      "车规AEC-Q100",
      "工业级"
    ],
    "fields": [
      "_params",
      "_detail_intro",
      "_detail_features"
    ],
    "auto": true,
    "aliases": [
      "消费级",
      "consumer"
    ],
    "regex": "应用等级[:\\s]*消费级|消费级|consumer",
    "keywords": "应用等级[:\\s]*消费级|消费级|consumer",
    "query_regex": "消费级|consumer",
    "include": []
  }
]
