# 项目上下文信息

- 已在 augment-manager.html 的 showImportDialog() 中加入“手动填写导入(可选填)”Tab（Email/Tenant/Token/subToken，至少填一项；支持“添加一条并继续”“添加并完成”）并在“粘贴导入”路径为缺失字段自动补全：id=Date.now()+idx、status=subToken?"UNKNOWN":"NO_TOKEN"、updatedAt=now()；导入后刷新主界面。
