---
title: UE5中的卡通渲染——自定义材质编辑器
sidebar: false
categories:
  - UE
tags:
  - UE
  - Game Develop
  - Render
editLink: true
prev: false
next: false
---

# UE5中的卡通渲染——自定义材质编辑器

继上一篇完成了描边的DrawPass之后，我们需要一个开关来随时控制材质是否进行该Pass的绘制，那么就需要自定义材质编辑器，来添加我们需要的控制开关。这个开关可以根据业务场景选择加在Component上也可以选择直接加在材质编辑器上，这里选择加在材质编辑器的实现方案。

## UE中材质相关类的组织

要想自定义材质编辑器的思路更加清晰，了解UE中材质相关类的组织是无论如何也不可避免的。UE中有非常多名称中带有Material的类，初看时并不容易很快理清这其中的是是非非，这里就先来简单梳理一下。

- UMaterial/UMaterialInstance

这两个类是离用户最近的类，他们都是UObject，都继承自UMaterialInterface。也就是说，平时打开引擎，打开材质或者材质实例编辑器，看到的就是这两个类当中的内容，他们可以理解为专门负责引擎与用户的交互，存储用户修改的材质数据等等。

不过需要注意的是，UMaterialInstance并不直接继承于UMaterial，我们平时继承母材质或者材质实例的操作在引擎中是通过组合的方式来进行实现的，UMaterialIntence中包含一个名称为Parent的UMaterialInterface类型的成员，这也证明了材质实例既可以直接继承母材质，也可以继承自其他的材质实例。

- FMaterialResource/FMaterial

非要说的话，这两个类才是真正的材质功能类。FMaterialResource是FMaterial的子类，FMaterial中定义了大部分材质需要完成的功能，在引擎内部，材质与Shader的交互，与Pipeline的交互，大部分也都是通过FMaterial来进行实现的。FMaterialResource中实现了部分FMaterial未实现的功能，但是在目前我们未接触到FMaterial的其他子类之前，完全可以把FMaterialResource当作是FMaterial的一个完全体来看待。总之他们材质真正负责引擎内部大部分的材质相关的工作。

- FMaterialRelevance

这其实是一个结构体，会发现其中包含了非常多的bool变量，他的作用可以理解为材质对渲染管线控制的一个开关集，通过一系列的标记来确定渲染某个物体时，哪些流程应该被绘制，哪些流程应该被跳过。

## 母材质编辑器的修改

一种比较方便实用的方式是，在IDE中全局搜索与想增加的属性相类似的属性，然后直接在每一个搜到的文件中添加自己的属性，工作差不多就算是完成了。

例如我想在编辑器中添加一个`HasOutline`的勾选框，可以直接搜索`TwoSided`属性，然后照葫芦画瓢来添加代码。

由于此处的代码非常简单，但是直接贴代码会显得非常不清晰，这里只列出一个在母材质编辑器中添加属性的通用思路。

1. 在UMaterial以及UMaterialInstance中添加属性

```cpp
//Material.h
/** Whether meshes render outline.*/
UPROPERTY(EditAnywhere, Category=Material)
uint8 bHasOutline : 1;

//MaterialInstance.h
uint8 bHasOutline : 1;
```

2. 在UMaterialInterface类中声明对应的Get方法，并在UMaterial以及UMaterialInstance中重载实现

```cpp
//MaterialInterface.h
ENGINE_API virtual bool HasOutline() const;

//MaterialInterface.cpp
bool UMaterialInterface::HasOutline() const
{
	return false;
}

//Material.h
ENGINE_API virtual bool HasOutline() const override;

//Material.cpp
bool UMaterial::HasOutline() const
{
	return bHasOutline != 0;
}

//MaterialInstance.h
ENGINE_API virtual bool HasOutline() const override;

//MaterialInstance.cpp
bool UMaterialInstanceDynamic::HasOutline() const
{
	return Parent ? Parent->HasOutline() : false;
}
```

3. 在FMaterial以及FMaterialResource中实现对应的Get方法

```cpp
//MaterialShared.h
//FMaterial
virtual bool HasOutline() const { return false; };

//MaterialShared.h
//FMaterialResource
ENGINE_API virtual bool HasOutline() const override;

//MaterialShared.h
//FMaterialShaderParameters
uint64 bHasOutline : 1;

//MaterialShared.cpp
bool FMaterialResource::HasOutline() const 
{
	return Material->HasOutline();
}

//MaterialShared.cpp
//FMaterialShaderParameters::FMaterialShaderParameters(const FMaterial* InMaterial)
bHasOutline = InMaterial->HasOutline();
```

4. 添加MaterialRelevence来控制渲染管线
```cpp
//MaterialRelevance.h
uint8 bHasOutline : 1;

//SceneVisibility.cpp
if (StaticMeshRelevance.bHasOutline)
{
    DrawCommandPacket.AddCommandsForMesh(PrimitiveIndex, PrimitiveSceneInfo, StaticMeshRelevance, StaticMesh, Scene, bCanCache, EMeshPass::OutlinePass);
}

//SceneCore.h
//FStaticMeshBatchRelevance
uint8 bHasOutline : 1;

//PrimitiveSceneInfo.cpp
//virtual void DrawMesh(const FMeshBatch& Mesh, float ScreenSize) final override
bool bHasOutline = Material.HasOutline();

FStaticMeshBatchRelevance* StaticMeshRelevance = new(PrimitiveSceneInfo->StaticMeshRelevances) FStaticMeshBatchRelevance(
    *StaticMesh, 
    ScreenSize, 
    bSupportsCachingMeshDrawCommands,
    bUseSkyMaterial,
    bUseSingleLayerWaterMaterial,
    bUseAnisotropy,
    bSupportsNaniteRendering,
    bSupportsGPUScene,
    bHasOutline,
    FeatureLevel
    );
```

其实母材质编辑器的修改到这里已经差不多了，如果有什么遗漏的地方，可以按照全局搜索相似的属性来做一遍校对，问题也不大，做完之后会发现母材质编辑器的细节面板会多出一个Outline的勾选框，选中之后即可在渲染管线中开启OutlinePass。

## 材质实例编辑器的修改

但是仅仅只修改母材质的编辑器还远远不够，很多材质的微调都是在材质实例上实现的，然而在材质实例的编辑器上实现对应的按钮相对来说要更复杂一些，因为他的面板并不是直接调用反射根据类中的成员自动生成的，而是需要我们自己去绘制相对应的UI布局。

当然接着上面的情况，我们需要首先把材质实例相关部分的实现也给补齐。同样由于这部分的改写虽然复杂但是没有太大难度，这里也只列出一个通用流程。

1. 在FMaterialInstanceBasePropertyOverrides中添加对应的属性，来应对材质实例重写母材质参数的情况

```cpp
//MaterialInstanceBasePropertyOverrides.h
/** Enables override of Outline property. */
UPROPERTY(EditAnywhere, Category = Material)
uint8 bOverride_HasOutline : 1;

/** Indicates that the material should be rendered with outline. */
UPROPERTY(EditAnywhere, Category = Material, meta = (editcondition = "bOverride_HasOutline"))
uint8 HasOutline : 1;
```

2. 在FMaterialInstanceParameterDetails中添加相关的函数
```cpp
//MaterialEditorInstanceDetailCustomization.h
bool OverrideEnableOutlineEnabled() const;
void OnOverrideEnableOutlineEnabled(bool NewValue);

//MaterialEditorInstanceDetailCustomization.cpp
bool FMaterialInstanceParameterDetails::OverrideEnableOutlineEnabled() const
{
	return MaterialEditorInstance->BasePropertyOverrides.bOverride_HasOutline;
}

void FMaterialInstanceParameterDetails::OnOverrideEnableOutlineEnabled(bool NewValue)
{
	MaterialEditorInstance->BasePropertyOverrides.bOverride_HasOutline = NewValue;
	MaterialEditorInstance->PostEditChange();
	FEditorSupportDelegates::RedrawAllViewports.Broadcast();
}
```

3. 在FMaterialInstanceParameterDetails中编写界面

```cpp
//MaterialEditorInstanceDetailCustomization.cpp
//void FMaterialInstanceParameterDetails::CreateBasePropertyOverrideWidgets(IDetailLayoutBuilder& DetailLayout, IDetailGroup& MaterialPropertyOverrideGroup)

TAttribute<bool> IsOVerrideEnableOutlineEnabled = TAttribute<bool>::Create(TAttribute<bool>::FGetter::CreateSP(this, &FMaterialInstanceParameterDetails::OverrideEnableOutlineEnabled));

TSharedPtr<IPropertyHandle> EnableOutlineProperty = BasePropertyOverridePropery->GetChildHandle("HasOutline");

{
    FIsResetToDefaultVisible IsEnableOutlinePropertyResetVisible = FIsResetToDefaultVisible::CreateLambda([this](TSharedPtr<IPropertyHandle> InHandle) {
        return MaterialEditorInstance->Parent != nullptr ? MaterialEditorInstance->BasePropertyOverrides.HasOutline != MaterialEditorInstance->Parent->HasOutline() : false;
        });
    FResetToDefaultHandler ResetEnableOutlinePropertyHandler = FResetToDefaultHandler::CreateLambda([this](TSharedPtr<IPropertyHandle> InHandle) {
        if (MaterialEditorInstance->Parent != nullptr)
        {
            MaterialEditorInstance->BasePropertyOverrides.HasOutline = MaterialEditorInstance->Parent->HasOutline();
        }
        });
    FResetToDefaultOverride ResetEnableOutlinePropertyOverride = FResetToDefaultOverride::Create(IsEnableOutlinePropertyResetVisible, ResetEnableOutlinePropertyHandler);
    IDetailPropertyRow& EnableOutlinePropertyRow = BasePropertyOverrideGroup.AddPropertyRow(EnableOutlineProperty.ToSharedRef());
    EnableOutlinePropertyRow
        .DisplayName(EnableOutlineProperty->GetPropertyDisplayName())
        .ToolTip(EnableOutlineProperty->GetToolTipText())
        .EditCondition(IsOVerrideEnableOutlineEnabled, FOnBooleanValueChanged::CreateSP(this, &FMaterialInstanceParameterDetails::OnOverrideEnableOutlineEnabled))
        .Visibility(TAttribute<EVisibility>::Create(TAttribute<EVisibility>::FGetter::CreateSP(this, &FMaterialInstanceParameterDetails::IsOverriddenAndVisible, IsOVerrideEnableOutlineEnabled)))
        .OverrideResetToDefault(ResetEnableOutlinePropertyOverride);
}

```

这样一来，材质实例的编辑器也就定制好了。掌握了这个流程之后，可以根据自己的需求在其中添加更多的选项来扩展自己的功能，例如描边的颜色，描边的粗细程度等，之后将材质实例中获取的这些参数传入Shader，一个在材质实例自由控制的描边功能就算是完成了。

最后，离上一篇更新已经过去了许久，现在发现工程类型的文章其实也没有那么好写，不写代码实现，原理往往非常简单，写了代码实现，文章又会显得十分冗余，这次就尝试把一个通用的思路提取出来，不知道能不能帮到对UE感兴趣的朋友们。

这次就先这样子吧。

