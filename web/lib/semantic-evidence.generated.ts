import type { SemanticEvidenceRule } from "./semantic-evidence";

export const GENERATED_SEMANTIC_EVIDENCE_RULES: SemanticEvidenceRule[] = [
  {
    "_lineno": 24,
    "tag": "特定帧唤醒",
    "dimension": "technology",
    "strength": "must",
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
    "query_regex": "特定帧唤醒|partial[ -]?networking|selective\\s*wake(?:[-\\s]*up)?",
    "storage": "feature_tag"
  },
  {
    "_lineno": 26,
    "tag": "SIC",
    "dimension": "technology",
    "strength": "must",
    "include": [
      "CAN-FD",
      "CAN"
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
      "信号改善",
      "信号改善能力"
    ],
    "regex": "signal\\s*improvement\\s*capability|\\bSIC\\b|信号改善(?:能力)?",
    "keywords": "SIC|signal\\s*improvement|信号改善(?:能力)?|增强.*CAN|CAN.*增强",
    "query_regex": "\\bsic\\b|signal\\s*improvement|信号改善(?:能力)?",
    "exclude": [],
    "storage": "feature_tag"
  },
  {
    "_lineno": 28,
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
    "exclude": [],
    "storage": "feature_tag"
  },
  {
    "_lineno": 31,
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
    "exclude": [],
    "storage": "feature_tag"
  },
  {
    "_lineno": 33,
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
    "exclude": [],
    "storage": "feature_tag"
  },
  {
    "_lineno": 35,
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
    "query_regex": "轨到轨|rail[ -]?to[ -]?rail|rail[ -]?rail",
    "storage": "feature_tag"
  },
  {
    "_lineno": 37,
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
    "exclude": [],
    "storage": "feature_tag"
  },
  {
    "_lineno": 39,
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
    "exclude": [],
    "storage": "feature_tag"
  },
  {
    "_lineno": 41,
    "tag": "可编程死区时间",
    "dimension": "feature",
    "strength": "nice",
    "include": [
      "隔离半桥栅极驱动"
    ],
    "fields": [
      "_params",
      "_detail_features"
    ],
    "auto": false,
    "aliases": [
      "死区时间可调",
      "可编程死区时间",
      "可编程死区",
      "programmable dead time"
    ],
    "regex": "死区时间可调|可编程死区时间|可编程死区|programmable\\s+dead[ -]?time",
    "keywords": "死区时间可调|可编程死区时间|可编程死区|programmable\\s+dead[ -]?time",
    "query_regex": "可编程死区时间|死区时间(?:可调|可编程)|programmable\\s+dead[ -]?time",
    "exclude": [],
    "storage": "feature_tag"
  },
  {
    "_lineno": 43,
    "tag": "欠压锁定",
    "dimension": "feature",
    "strength": "nice",
    "include": [
      "隔离半桥栅极驱动"
    ],
    "fields": [
      "_params",
      "_detail_intro",
      "_detail_features"
    ],
    "auto": false,
    "aliases": [
      "欠压锁定",
      "UVLO",
      "undervoltage lockout"
    ],
    "regex": "欠压锁定|\\bUVLO\\b|undervoltage\\s+lockout",
    "keywords": "欠压锁定|\\bUVLO\\b|undervoltage\\s+lockout",
    "query_regex": "欠压锁定|\\bUVLO\\b|undervoltage\\s+lockout",
    "exclude": [],
    "storage": "feature_tag"
  },
  {
    "_lineno": 47,
    "tag": "CMTI",
    "dimension": "feature",
    "strength": "must",
    "include": [
      "隔离半桥栅极驱动选型表",
      "隔离单管栅极驱动选型表",
      "集成短路保护的智能隔离式栅极驱动选型表",
      "隔离栅极驱动",
      "数字隔离器选型表",
      "数字隔离器",
      "隔离ADC 选型表",
      "隔离CAN 收发器选型表",
      "隔离电流放大器选型表",
      "隔离电压放大器选型表",
      "隔离比较器选型表",
      "隔离误差放大器选型表",
      "隔离I2C",
      "隔离RS-485 收发器选型表",
      "隔离RS485",
      "隔离CAN",
      "集成隔离电源的隔离RS485 选型表",
      "集成隔离电源的隔离CAN 选型表"
    ],
    "fields": [
      "_params",
      "_detail_intro",
      "_detail_features"
    ],
    "auto": false,
    "storage": "source_evidence",
    "aliases": [
      "CMTI",
      "共模瞬态抗扰度",
      "共模瞬变抗扰度",
      "共模瞬变抗扰",
      "common-mode transient immunity",
      "common mode transient immunity"
    ],
    "regex": "\\bCMTI\\b|共模瞬态抗扰度|共模瞬变抗扰度|共模瞬变抗扰|common[ -]mode transient immunity",
    "keywords": "\\bCMTI\\b|共模瞬态抗扰度|共模瞬变抗扰度|共模瞬变抗扰|common[ -]mode transient immunity",
    "query_regex": "\\bCMTI\\b|共模瞬态抗扰度|共模瞬变抗扰度|共模瞬变抗扰|common[ -]mode transient immunity",
    "exclude": []
  },
  {
    "_lineno": 51,
    "tag": "峰值电流模式",
    "dimension": "feature",
    "strength": "must",
    "include": [
      "宽压降压变换器",
      "中压降压变换器",
      "低压降压变换器"
    ],
    "fields": [
      "_params"
    ],
    "auto": false,
    "storage": "source_evidence",
    "aliases": [
      "峰值电流模式",
      "peak current mode"
    ],
    "regex": "峰值电流模式|peak\\s+current\\s+mode",
    "keywords": "峰值电流模式|peak\\s+current\\s+mode",
    "query_regex": "峰值电流模式|peak\\s+current\\s+mode",
    "exclude": []
  },
  {
    "_lineno": 54,
    "tag": "低传播延迟",
    "dimension": "feature",
    "strength": "nice",
    "include": [
      "隔离单管栅极驱动选型表",
      "数字隔离器选型表",
      "隔离比较器选型表"
    ],
    "fields": [
      "_detail_intro",
      "_detail_features"
    ],
    "auto": false,
    "storage": "source_evidence",
    "aliases": [
      "低传播延迟",
      "快速信号传播",
      "低延迟",
      "low propagation delay",
      "fast signal propagation"
    ],
    "regex": "低传播延迟|快速信号传播|低延迟|low\\s+propagation\\s+delay|fast\\s+signal\\s+propagation",
    "keywords": "低传播延迟|快速信号传播|低延迟|low\\s+propagation\\s+delay|fast\\s+signal\\s+propagation",
    "query_regex": "低传播延迟|快速信号传播|低延迟|low\\s+propagation\\s+delay|fast\\s+signal\\s+propagation",
    "exclude": []
  },
  {
    "_lineno": 57,
    "tag": "过流保护",
    "dimension": "feature",
    "strength": "must",
    "include": [
      "霍尔开关/ 锁存器选型表",
      "直流有刷电机驱动选型表",
      "低边驱动/ 开关选型表",
      "微步控制步进电机驱动选型表",
      "集成隔离电源的隔离CAN 选型表",
      "非隔离低边栅极驱动选型表"
    ],
    "fields": [
      "_params",
      "_detail_intro",
      "_detail_features"
    ],
    "auto": false,
    "storage": "source_evidence",
    "aliases": [
      "过流保护",
      "overcurrent protection",
      "over-current protection"
    ],
    "regex": "过流保护|over[ -]?current protection",
    "keywords": "过流保护|over[ -]?current protection",
    "query_regex": "过流保护|over[ -]?current protection",
    "exclude": []
  },
  {
    "_lineno": 58,
    "tag": "短路保护",
    "dimension": "feature",
    "strength": "must",
    "include": [
      "智能高边开关选型表",
      "LDO 线性稳压器选型表",
      "集成短路保护的智能隔离式栅极驱动选型表",
      "低边驱动/ 开关选型表",
      "霍尔开关/ 锁存器选型表",
      "温度传感器选型表",
      "Boost 控制器选型表",
      "DC-DC 开关变换器选型表"
    ],
    "fields": [
      "_params",
      "_detail_intro",
      "_detail_features"
    ],
    "auto": false,
    "storage": "source_evidence",
    "aliases": [
      "短路保护",
      "short-circuit protection",
      "short circuit protection"
    ],
    "regex": "短路保护|short[ -]?circuit protection",
    "keywords": "短路保护|short[ -]?circuit protection",
    "query_regex": "短路保护|short[ -]?circuit protection",
    "exclude": []
  },
  {
    "_lineno": 59,
    "tag": "过温保护",
    "dimension": "feature",
    "strength": "must",
    "include": [
      "智能高边开关选型表",
      "直流有刷电机驱动选型表",
      "低边驱动/ 开关选型表",
      "DC-DC 开关变换器选型表",
      "集成隔离电源的隔离CAN 选型表",
      "PWM 控制器",
      "LDO 线性稳压器选型表",
      "微步控制步进电机驱动选型表",
      "氮化镓功率芯片选型表",
      "线性LED 驱动选型表"
    ],
    "fields": [
      "_params",
      "_detail_intro",
      "_detail_features"
    ],
    "auto": false,
    "storage": "source_evidence",
    "aliases": [
      "过温保护",
      "over-temperature protection",
      "over temperature protection",
      "thermal shutdown"
    ],
    "regex": "过温保护|over[ -]?temperature protection|thermal shutdown",
    "keywords": "过温保护|over[ -]?temperature protection|thermal shutdown",
    "query_regex": "过温保护|over[ -]?temperature protection|thermal shutdown",
    "exclude": []
  },
  {
    "_lineno": 60,
    "tag": "过压保护",
    "dimension": "feature",
    "strength": "must",
    "include": [
      "智能高边开关选型表",
      "霍尔开关/ 锁存器选型表",
      "PWM 控制器",
      "直流有刷电机驱动选型表",
      "DC-DC 开关变换器选型表",
      "Boost 控制器选型表"
    ],
    "fields": [
      "_params",
      "_detail_intro",
      "_detail_features"
    ],
    "auto": false,
    "storage": "source_evidence",
    "aliases": [
      "过压保护",
      "overvoltage protection",
      "over-voltage protection"
    ],
    "regex": "过压保护|over[ -]?voltage protection",
    "keywords": "过压保护|over[ -]?voltage protection",
    "query_regex": "过压保护|over[ -]?voltage protection",
    "exclude": []
  },
  {
    "_lineno": 64,
    "tag": "差分输出",
    "dimension": "feature",
    "strength": "must",
    "include": [
      "隔离电流放大器选型表"
    ],
    "fields": [
      "_params",
      "_detail_intro",
      "_detail_features"
    ],
    "auto": false,
    "storage": "source_evidence",
    "aliases": [
      "差分输出",
      "全差分输出",
      "differential output",
      "fully differential output"
    ],
    "regex": "(?<!伪)差分输出|(?<!pseudo-)(?<!pseudo )\\bdifferential[ -]output\\b",
    "keywords": "(?<!伪)差分输出|(?<!pseudo-)(?<!pseudo )\\bdifferential[ -]output\\b",
    "query_regex": "(?<!伪)差分输出|(?<!pseudo-)(?<!pseudo )\\bdifferential[ -]output\\b",
    "exclude": []
  },
  {
    "_lineno": 65,
    "tag": "伪差分输出",
    "dimension": "feature",
    "strength": "must",
    "include": [
      "集成式电流传感器选型表"
    ],
    "fields": [
      "_params",
      "_detail_intro",
      "_detail_features"
    ],
    "auto": false,
    "storage": "source_evidence",
    "aliases": [
      "伪差分输出",
      "pseudo-differential output",
      "pseudo differential output"
    ],
    "regex": "伪差分输出|pseudo[ -]differential output",
    "keywords": "伪差分输出|pseudo[ -]differential output",
    "query_regex": "伪差分输出|pseudo[ -]differential output",
    "exclude": []
  },
  {
    "_lineno": 68,
    "tag": "EFT抗扰度",
    "dimension": "feature",
    "strength": "must",
    "include": [
      "数字隔离器选型表",
      "隔离CAN 收发器选型表",
      "隔离I2C"
    ],
    "fields": [
      "_params",
      "_detail_intro",
      "_detail_features"
    ],
    "auto": false,
    "storage": "source_evidence",
    "aliases": [
      "EFT",
      "electrical fast transient",
      "电快速瞬变脉冲群",
      "快速瞬变脉冲群"
    ],
    "regex": "\\bEFT\\b|electrical[ -]fast transient|电快速瞬变脉冲群|快速瞬变脉冲群",
    "keywords": "\\bEFT\\b|electrical[ -]fast transient|电快速瞬变脉冲群|快速瞬变脉冲群",
    "query_regex": "\\bEFT\\b|electrical[ -]fast transient|电快速瞬变脉冲群|快速瞬变脉冲群",
    "exclude": []
  },
  {
    "_lineno": 71,
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
    "exclude": [],
    "storage": "feature_tag"
  },
  {
    "_lineno": 73,
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
    "exclude": [],
    "storage": "feature_tag"
  },
  {
    "_lineno": 74,
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
    "exclude": [],
    "storage": "feature_tag"
  },
  {
    "_lineno": 75,
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
    "exclude": [],
    "storage": "feature_tag"
  },
  {
    "_lineno": 78,
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
    "include": [],
    "storage": "feature_tag"
  },
  {
    "_lineno": 80,
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
    "include": [],
    "storage": "feature_tag"
  },
  {
    "_lineno": 82,
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
    "include": [],
    "storage": "feature_tag"
  }
]
