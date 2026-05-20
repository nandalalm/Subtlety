import profileService from "../services/profileService.js";
import HTTP_STATUS from "../Constants/httpStatus.js";
import MESSAGES from "../Constants/messages.js";

class ProfileController {
async getUserProfile(req, res, next) {
  try {
    const user = req.session.user;
    res.render("user/profile", { user });
  } catch (error) {
    next(error);
  }
}

async updateUserProfile(req, res, next) {
  const { firstname, lastname } = req.body;
  const userId = req.session.user._id;
  try {
    await profileService.updateProfile(userId, { firstname, lastname });
    req.session.user.firstname = firstname;
    req.session.user.lastname = lastname;
    res.status(HTTP_STATUS.OK).json({ message: MESSAGES.PROFILE.UPDATED });
  } catch (error) {
    next(error);
  }
}

async updateEmail(req, res, next) {
  const { email } = req.body;
  const userId = req.session.user._id;
  try {
    await profileService.updateProfile(userId, { email });
    req.session.user.email = email;
    res.status(HTTP_STATUS.OK).json({ message: MESSAGES.PROFILE.EMAIL_UPDATED });
  } catch (error) {
    next(error);
  }
}

async updatePhoneNumber(req, res, next) {
  const { phone } = req.body;
  const userId = req.session.user._id;
  try {
    await profileService.updateProfile(userId, { phoneNo: phone });
    req.session.user.phoneNo = phone;
    res.status(HTTP_STATUS.OK).json({ message: MESSAGES.PROFILE.PHONE_UPDATED });
  } catch (error) {
    next(error);
  }
}

async getAddresses(req, res, next) {
  const userId = req.session.user._id;
  const page = parseInt(req.query.page) || 1;
  try {
    const data = await profileService.getAddresses(userId, page);
    res.render("user/address", {
      ...data,
      user: req.session.user,
      currentPage: page
    });
  } catch (error) {
    next(error);
  }
}

async getAddAddressPage(req, res, next) {
  try {
    res.render("user/addressForm", {
      user: req.session.user,
      address: null,
      mode: "add"
    });
  } catch (error) {
    next(error);
  }
}

async getEditAddressPage(req, res, next) {
  try {
    const address = await profileService.getAddressById(req.params.id);
    res.render("user/addressForm", {
      user: req.session.user,
      address,
      mode: "edit"
    });
  } catch (error) {
    next(error);
  }
}

async addAddress(req, res, next) {
  const userId = req.session.user._id;
  try {
    await profileService.addAddress(userId, req.body);
    res.status(HTTP_STATUS.OK).json({ message: MESSAGES.PROFILE.ADDRESS_ADDED });
  } catch (error) {
    next(error);
  }
}

async editAddress(req, res, next) {
  const { id } = req.params;
  try {
    const updated = await profileService.updateAddress(id, req.body);
    res.status(HTTP_STATUS.OK).json({
      message: MESSAGES.PROFILE.ADDRESS_UPDATED,
      address: updated
    });
  } catch (error) {
    next(error);
  }
}

async deleteAddress(req, res, next) {
  const { id } = req.params;
  try {
    await profileService.deleteAddress(id);
    res.status(HTTP_STATUS.OK).json({ message: MESSAGES.PROFILE.ADDRESS_DELETED });
  } catch (error) {
    next(error);
  }
}

async changePassword(req, res, next) {
  const { currentPassword, newPassword, confirmPassword } = req.body;
    const userId = req.session.user._id;
  try {
    if (newPassword !== confirmPassword) {
      return next({ statusCode: HTTP_STATUS.BAD_REQUEST, message: MESSAGES.PROFILE.PASSWORDS_DONT_MATCH });
    }
    await profileService.updatePassword(userId, currentPassword, newPassword);
    res.status(HTTP_STATUS.OK).json({ message: MESSAGES.PROFILE.PASSWORD_CHANGED });
  } catch (error) {
    next(error);
  }
}

async getWalletBalance(req, res, next) {
  try {
    const userId = req.session.user._id;
    const balance = await profileService.getWalletBalance(userId);
    return res.status(HTTP_STATUS.OK).json({ balance });
  } catch (error) {
    next(error);
  }
}

async deductWalletAmount(req, res, next) {
  try {
    const userId = req.session.user._id;
    const { orderId, amount } = req.body;
    const data = await profileService.deductWalletAmount(userId, orderId, amount);
    return res.status(HTTP_STATUS.OK).json({
      message: MESSAGES.WALLET.PAYMENT_SUCCESS,
      remainingBalance: data.balance
    });
  } catch (error) {
    next(error);
  }
}

async getWallet(req, res, next) {
  const userId = req.session.user._id;
  const queryParams = {
    page: parseInt(req.query.page) || 1,
    search: req.query.search || "",
    sort: req.query.sort || "latest"
  };
  try {
    const data = await profileService.getWalletData(userId, queryParams);
    
    if (req.query.ajax) {
        return res.render("partials/User/walletTable", {
            ...data,
            currentPage: queryParams.page,
            search: queryParams.search,
            sort: queryParams.sort,
            limit: data.limit || 10
        });
    }

    res.render("user/userWallet", {
      ...data,
      user: req.session.user,
      referralBaseUrl: process.env.CLIENT_URL_FOR_REFFERAL,
      currentPage: queryParams.page,
      search: queryParams.search,
      sort: queryParams.sort
    });
  } catch (error) {
    next(error);
  }
}
}

const profileController = new ProfileController();

const getUserProfile = profileController.getUserProfile.bind(profileController);
const updateUserProfile = profileController.updateUserProfile.bind(profileController);
const updateEmail = profileController.updateEmail.bind(profileController);
const updatePhoneNumber = profileController.updatePhoneNumber.bind(profileController);
const getAddresses = profileController.getAddresses.bind(profileController);
const getAddAddressPage = profileController.getAddAddressPage.bind(profileController);
const getEditAddressPage = profileController.getEditAddressPage.bind(profileController);
const addAddress = profileController.addAddress.bind(profileController);
const editAddress = profileController.editAddress.bind(profileController);
const deleteAddress = profileController.deleteAddress.bind(profileController);
const changePassword = profileController.changePassword.bind(profileController);
const getWalletBalance = profileController.getWalletBalance.bind(profileController);
const deductWalletAmount = profileController.deductWalletAmount.bind(profileController);
const getWallet = profileController.getWallet.bind(profileController);

export {
  getUserProfile,
  updateUserProfile,
  updateEmail,
  updatePhoneNumber,
  getAddresses,
  getAddAddressPage,
  getEditAddressPage,
  addAddress,
  editAddress,
  deleteAddress,
  changePassword,
  getWalletBalance,
  deductWalletAmount,
  getWallet
};
