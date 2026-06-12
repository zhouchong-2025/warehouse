# 已知陷阱

- ⚠️ TPDA系列是ASN音频总线，不是CAN收发器
- ⚠️ 1mV≠1Mbps：参数提取时注意单位上下文
- ⚠️ 收发器≠CAN：需确认Technology Family
- ⚠️ 非隔离=不要隔离标签，不是否定品类
- ⚠️ 标签不能含空格(前端split拆分)
- ⚠️ 精密(≤1mV)必须校验Vos(Max)实际值
- ⚠️ 隔离标签需要参数支撑(kV/CMTI/隔离电压)
- ⚠️ autofix后必须跑tag_audit(autofix会覆盖tag_config标签)
