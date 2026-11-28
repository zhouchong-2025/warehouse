# 裕太微以太网PHY介质与车规资料定位

用途：FAE术语解释及原厂资料定位；这是检索上下文，不自动改写结构化事实或替代型号证书。

核对日期：2026-11-18。
原厂产品页：https://www.motor-comm.com/product/vehicle-chip
原厂产品介绍：https://www.motor-comm.com/news/82.html
原厂系列简报：https://www.motor-comm.com/Public/Uploads/uploadfile/files/20240117/YT8522ProductBrief_v0.1.pdf

## 术语与线路角色

百兆PHY选型中TX通常指100BASE-TX铜缆线路标准，T1指100BASE-T1单对线线路标准；两者不是同一种介质接口。MAC侧MII/RMII/RGMII/SGMII独立核验，不证明线路标准。讨论TX引脚或发送时序时，TX可能只是发送方向，须结合整句，不按孤立词硬路由。

## 原厂逐型号定位

- YT8522A：原厂车载产品页的YT8522A块明确列Support IEEE 802.3 10Base-Te and 100Base-Tx、MII/RMII MAC、QFN32 5x5mm、AEC-Q100 Grade 2。原厂新闻对应“车规级百兆以太网物理层芯片-YT8522A”段，说明符合100BASE-TX/10BASE-Te，AEC-Q Grade2，温度-40℃至105℃。YT8522系列简报第4物理页还列100Base-TX IEEE802.3u、100BASE-FX support；系列简报本身不证明所有后缀车规。
- YT8010A：同一原厂产品页的单独型号块列100BASE-T1 IEEE802.3bw、RGMII/MII/RMII、Grade1。不能因车规百兆就作为TX等价型号。
- YT8011A系列：原厂产品页同时列1000BASE-T1和100BASE-T1；不能仅凭千兆定位就断言不支持100Mbps，但其T1介质仍不能当TX。

本地选型表YT8522A简介写工业级特殊场景、支持100FX，Note明确“满足Automotive Application AEC-Q100 Grade 2”。100FX支持不排除TX支持，工业级描述也不能自动否定同一型号更具体的汽车应用资格声明；按原厂型号页和Note核验，不要求用户重复确认工程常识。原厂认证声明不代替完整认证报告或特定系统适用性。

检索别名：车规 Tx 的 Phy 100兆、100BASE-TX、100Base-Tx、铜口、双绞线、100BASE-T1、T1、YT8522A、YT8010A。
